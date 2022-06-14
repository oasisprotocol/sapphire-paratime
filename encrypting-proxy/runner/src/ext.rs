use std::{
    io::Write,
    pin::Pin,
    task::{Context, Poll},
};

use anyhow::anyhow;
use enclave_runner::usercalls::{AsyncStream, UsercallExtension};
use futures_util::{future::LocalBoxFuture, FutureExt};
use sgx_isa::Report;

#[derive(Clone, Copy, Debug)]
pub(crate) struct DcapQuoteExtension;

impl UsercallExtension for DcapQuoteExtension {
    fn connect_stream<'a>(
        &'a self,
        addr: &'a str,
        _local_addr: Option<&'a mut String>,
        _peer_addr: Option<&'a mut String>,
    ) -> LocalBoxFuture<'a, std::io::Result<Option<Box<dyn AsyncStream>>>> {
        async move {
            if addr != "dcap-quote" {
                return Ok(None); // Treat the address as an IP address, the default behavior.
            }
            let svc: Box<dyn AsyncStream> = Box::new(DcapQuoteService::new(dcap_ql::quote));
            Ok(Some(svc))
        }
        .boxed_local()
    }
}

#[pin_project::pin_project]
struct DcapQuoteService {
    quoter: fn(&Report) -> Result<Vec<u8>, dcap_ql::Quote3Error>,
    state: DcapQuoteServiceState,
    span: tracing::Span,
}

impl DcapQuoteService {
    fn new(quoter: fn(&Report) -> Result<Vec<u8>, dcap_ql::Quote3Error>) -> Self {
        Self {
            quoter,
            state: DcapQuoteServiceState::default(),
            span: tracing::info_span!("quote-request"),
        }
    }
}

#[derive(Debug)]
enum DcapQuoteServiceState {
    WritingTargetInfo {
        target_info: Box<sgx_isa::Targetinfo>,
        position: usize,
    },
    ReadingReport {
        report: Box<[u8; Report::UNPADDED_SIZE]>,
        position: usize,
    },
    WritingQuote {
        quote: Vec<u8>,
        position: usize,
    },
    Complete,
}

impl Default for DcapQuoteServiceState {
    fn default() -> Self {
        Self::WritingTargetInfo {
            target_info: Box::new(dcap_ql::target_info().unwrap()), // TODO: no unwrap
            position: 0,
        }
    }
}

impl tokio::io::AsyncRead for DcapQuoteService {
    fn poll_read(
        self: Pin<&mut Self>,
        _cx: &mut Context<'_>,
        mut buf: &mut [u8],
    ) -> Poll<std::io::Result<usize>> {
        let mut this = self.project();
        let _entered = this.span.enter();
        match &mut this.state {
            DcapQuoteServiceState::WritingTargetInfo {
                target_info,
                position,
            } => {
                let ti_bytes: &[u8] = (**target_info).as_ref();
                let bytes_written = buf.write(&ti_bytes[*position..])?;
                *position += bytes_written;
                if *position == ti_bytes.len() {
                    tracing::debug!("wrote target info. switching to reading report");
                    *this.state = DcapQuoteServiceState::ReadingReport {
                        report: Box::new([0u8; Report::UNPADDED_SIZE]),
                        position: 0,
                    };
                }
                Poll::Ready(Ok(bytes_written))
            }
            DcapQuoteServiceState::WritingQuote { quote, position } => {
                const LEN_LEN: usize = std::mem::size_of::<u16>();
                let mut total_bytes_written = 0;
                if *position < LEN_LEN {
                    let length_bytes_written =
                        buf.write(&(quote.len() as u16).to_le_bytes()[*position..])?;
                    *position += length_bytes_written;
                    total_bytes_written += length_bytes_written;
                }
                if *position >= LEN_LEN {
                    let quote_position = *position - LEN_LEN;
                    let quote_bytes_written = buf.write(&quote[quote_position..])?;
                    *position += quote_bytes_written;
                    total_bytes_written += quote_bytes_written;
                    if *position == LEN_LEN + quote.len() {
                        *this.state = DcapQuoteServiceState::Complete;
                    }
                }
                Poll::Ready(Ok(total_bytes_written))
            }
            _ => {
                tracing::warn!("read of unavailable quote");
                Poll::Ready(Err(std::io::Error::new(
                    std::io::ErrorKind::UnexpectedEof,
                    "quote not available",
                )))
            }
        }
    }
}

impl tokio::io::AsyncWrite for DcapQuoteService {
    fn poll_write(
        self: Pin<&mut Self>,
        _cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        let mut this = self.project();
        let _entered = this.span.enter();
        match &mut this.state {
            DcapQuoteServiceState::ReadingReport { report, position }
                if *position < Report::UNPADDED_SIZE =>
            {
                let bytes_read = std::cmp::min(Report::UNPADDED_SIZE - *position, buf.len());
                report[*position..(*position + bytes_read)].copy_from_slice(buf);
                *position += bytes_read;
                if *position == Report::UNPADDED_SIZE {
                    let report = match Report::try_copy_from(&**report) {
                        Some(report) => report,
                        None => {
                            return Poll::Ready(Err(std::io::Error::new(
                                std::io::ErrorKind::InvalidData,
                                "invalid report",
                            )))
                        }
                    };
                    match (this.quoter)(&report) {
                        Ok(quote) => {
                            tracing::debug!("read report. switching to writing quote");
                            *this.state =
                                DcapQuoteServiceState::WritingQuote { quote, position: 0 };
                        }
                        Err(e) => {
                            tracing::error!(error=?e, "failed to get quote");
                            return Poll::Ready(Err(std::io::Error::other(anyhow!(
                                "failed to get quote: {e:?}"
                            ))));
                        }
                    }
                }
                Poll::Ready(Ok(bytes_read))
            }
            _ => {
                tracing::warn!("received data while not reading report");
                Poll::Ready(Ok(0))
            }
        }
    }

    fn poll_flush(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Poll::Ready(Ok(()))
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        self.state = Default::default();
        Poll::Ready(Ok(()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::task::Context;

    use tokio::io::{AsyncRead, AsyncWrite};

    const MOCK_QUOTE: &[u8] = &[1, 2, 3, 4, 5];

    fn mock_quoter(_report: &Report) -> Result<Vec<u8>, dcap_ql::Quote3Error> {
        Ok(MOCK_QUOTE.to_vec())
    }

    macro_rules! extract_ready {
        ($poll:expr) => {
            match $poll {
                Poll::Ready(v) => v,
                _ => unreachable!(),
            }
        };
    }

    #[test]
    fn protocol_happy_path() {
        let waker = futures_util::task::noop_waker();
        let mut cx = Context::from_waker(&waker);
        let mut service = Pin::new(Box::new(DcapQuoteService::new(mock_quoter)));

        let report = Report::default();
        let report_bytes: &[u8] = report.as_ref();
        let bytes_written =
            extract_ready!(service.as_mut().poll_write(&mut cx, report_bytes)).unwrap();
        assert_eq!(bytes_written, report_bytes.len());

        let mut read_buf = vec![0u8; 10];
        let bytes_read =
            extract_ready!(service.as_mut().poll_read(&mut cx, &mut read_buf)).unwrap();
        assert_eq!(bytes_read, MOCK_QUOTE.len() + std::mem::size_of::<u16>());
        assert_eq!(&read_buf[..2], (MOCK_QUOTE.len() as u16).to_le_bytes());
        assert_eq!(&read_buf[2..bytes_read], MOCK_QUOTE);
    }

    #[test]
    fn protocol_partial() {
        let waker = futures_util::task::noop_waker();
        let mut cx = Context::from_waker(&waker);
        let mut service = Pin::new(Box::new(DcapQuoteService::new(mock_quoter)));

        let report = Report::default();
        let report_bytes: &[u8] = report.as_ref();
        let bytes_written =
            extract_ready!(service.as_mut().poll_write(&mut cx, &report_bytes[0..10])).unwrap();
        assert_eq!(bytes_written, 10);
        let bytes_written =
            extract_ready!(service.as_mut().poll_write(&mut cx, &report_bytes[10..])).unwrap();
        assert_eq!(bytes_written, report_bytes.len() - 10);

        let mut read_buf = vec![0u8; 10];
        let bytes_read =
            extract_ready!(service.as_mut().poll_read(&mut cx, &mut read_buf[..1])).unwrap();
        assert_eq!(bytes_read, 1);
        let bytes_read =
            extract_ready!(service.as_mut().poll_read(&mut cx, &mut read_buf[1..])).unwrap();
        assert_eq!(bytes_read, MOCK_QUOTE.len() + 1);
        assert_eq!(&read_buf[..2], (MOCK_QUOTE.len() as u16).to_le_bytes());
        assert_eq!(
            &read_buf[2..(MOCK_QUOTE.len() + std::mem::size_of::<u16>())],
            MOCK_QUOTE
        );
    }

    #[test]
    fn protocol_early_read() {
        let waker = futures_util::task::noop_waker();
        let mut cx = Context::from_waker(&waker);
        let mut service = Pin::new(Box::new(DcapQuoteService::new(mock_quoter)));

        let mut read_buf = vec![0u8; 10];
        let read_result = extract_ready!(service.as_mut().poll_read(&mut cx, &mut read_buf));
        assert!(read_result.is_err());
    }

    #[test]
    fn protocol_late_write() {
        let waker = futures_util::task::noop_waker();
        let mut cx = Context::from_waker(&waker);
        let mut service = Pin::new(Box::new(DcapQuoteService::new(mock_quoter)));

        let report = Report::default();
        let report_bytes: &[u8] = report.as_ref();
        extract_ready!(service.as_mut().poll_write(&mut cx, report_bytes)).unwrap();
        assert_eq!(
            extract_ready!(service.as_mut().poll_write(&mut cx, report_bytes)).unwrap(),
            0
        );
    }
}
