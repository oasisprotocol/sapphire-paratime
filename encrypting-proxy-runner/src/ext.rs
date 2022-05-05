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
            let svc: Box<dyn AsyncStream> = Box::new(DcapQuoteService {
                state: DcapQuoteServiceState::default(),
                span: tracing::info_span!("quote-request"),
            });
            Ok(Some(svc))
        }
        .boxed_local()
    }
}

#[derive(Debug)]
#[pin_project::pin_project]
struct DcapQuoteService {
    state: DcapQuoteServiceState,
    span: tracing::Span,
}

#[derive(Debug)]
enum DcapQuoteServiceState {
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
        Self::ReadingReport {
            report: Box::new([0u8; Report::UNPADDED_SIZE]),
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
            DcapQuoteServiceState::WritingQuote { quote, position } => {
                const LEN_LEN: usize = std::mem::size_of::<u16>();
                let mut total_bytes_written = 0;
                if *position < LEN_LEN {
                    let length_bytes_written =
                        buf.write(&quote.len().to_le_bytes()[*position..])?;
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
                    match dcap_ql::quote(&report) {
                        Ok(quote) => {
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
