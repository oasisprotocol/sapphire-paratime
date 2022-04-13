use std::{cell::RefCell, io::Read, sync::Arc};

use bytes::{BufMut, Bytes, BytesMut};
use tiny_http::{Response, StatusCode};

use crate::{
    cipher::SessionCipher,
    req_tester::{RequestClass, RequestTester},
};

const MAX_REQUEST_SIZE_BYTES: usize = 1024 * 1024; // 1 MiB

pub(crate) struct Server {
    server: tiny_http::Server,
    config: crate::config::Config,
    req_tester: RequestTester,
    http_agent: ureq::Agent,
    cipher: SessionCipher,
}

impl Server {
    pub(crate) fn new(
        config: crate::config::Config,
    ) -> Result<Arc<Self>, Box<dyn std::error::Error + Send + Sync + 'static>> {
        let server_cfg = tiny_http::ServerConfig {
            addr: &config.listen_addr,
            ssl: None, // TODO: fetch from letsencrypt or other provider
        };
        Ok(Arc::new(Self {
            server: tiny_http::Server::new(server_cfg)?,
            config,
            req_tester: RequestTester::new(),
            http_agent: ureq::AgentBuilder::new()
                .timeout(std::time::Duration::from_secs(30))
                .build(),
            cipher: SessionCipher::new([0u8; 32]), // TODO
        }))
    }

    pub(crate) fn listen(&self) -> ! {
        loop {
            let req = self.server.recv().unwrap();
            if let Err(e) = self.handle_req(req) {
                tracing::error!(error=%e, "error handling request");
            }
        }
    }

    fn handle_req(&self, mut req: tiny_http::Request) -> Result<(), Box<dyn std::error::Error>> {
        thread_local!(static REQ_BUF: RefCell<BytesMut> = RefCell::new(BytesMut::new()));

        if self.config.tls && !req.secure() {
            req.respond(Response::new_empty(StatusCode(421)))?;
            return Ok(());
        }

        let content_length = match req.body_length() {
            Some(content_length) => content_length,
            None => {
                req.respond(Response::new_empty(StatusCode(411)))?;
                return Ok(());
            }
        };

        let body_bytes: Bytes = match REQ_BUF.with(|req_buf| {
            // NOTE: this could be made zero-copy for methods that don't require encryption,
            // but those methods are generally small, so there's not much value streaming them.
            let mut req_buf = req_buf.borrow_mut();
            if req_buf.capacity() < content_length {
                let additional = content_length - req_buf.capacity();
                req_buf.reserve(additional);
            }
            req_buf.clear();
            let mut req_rdr = req.as_reader().take(MAX_REQUEST_SIZE_BYTES as u64);
            let bytes_read = std::io::copy(&mut req_rdr, &mut req_buf.clone().writer())?;
            Ok::<_, std::io::Error>(req_buf.split_to(bytes_read as usize).freeze())
        }) {
            Ok(body_bytes) => body_bytes,
            Err(_) => {
                req.respond(Response::new_empty(StatusCode(400)))?;
                return Ok(());
            }
        };

        match self.req_tester.preflight(&body_bytes) {
            RequestClass::NonConfidential => {
                return self.proxy_pass(req, &body_bytes);
            }
            RequestClass::Confidential => {}
            RequestClass::Disallowed => {
                req.respond(Response::new_empty(StatusCode(400)))?;
                return Ok(());
            }
        }

        let mut web3_req: JsonRpcRequest<'_> = match serde_json::from_slice(&body_bytes) {
            Ok(req) => req,
            Err(_) => {
                req.respond(Response::new_empty(StatusCode(400)))?;
                return Ok(());
            }
        };

        match self.req_tester.test(&web3_req.method) {
            RequestClass::Confidential => {}
            RequestClass::NonConfidential => {
                tracing::warn!("encountered false positive `{}` request", web3_req.method);
                return self.proxy_pass(req, &body_bytes);
            }
            RequestClass::Disallowed => {
                tracing::warn!("encountered false positive `{}` request", web3_req.method);
                req.respond(Response::new_empty(StatusCode(400)))?;
                return Ok(());
            }
        }

        let data_value = match &*web3_req.method {
            "eth_sendRawTransaction" => web3_req.params.get_mut(0),
            "eth_call" | "eth_estimateGas" => web3_req
                .params
                .get_mut(0)
                .and_then(|p0| p0.as_object_mut())
                .and_then(|tx| tx.get_mut("data")),
            _ => unreachable!("checked above"),
        };
        if let Some(data_value) = data_value {
            let data = match data_value
                .as_str()
                .and_then(|data_hex| hex::decode(data_hex).ok()) // TODO: decode_to_slice into REQ_BUF
            {
                Some(data) => data,
                None => {
                    req.respond(Response::new_empty(StatusCode(400)))?;
                    return Ok(());
                }
            };
            *data_value = hex::encode(self.cipher.encrypt(&data)).into();
        }

        self.proxy_pass(req, &serde_json::to_vec(&web3_req)?)
    }

    fn proxy_pass(
        &self,
        incoming_req: tiny_http::Request,
        proxy_req_body: &[u8],
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut proxy_req = self.http_agent.request_url("POST", &self.config.upstream);
        for tiny_http::Header { field, value } in incoming_req.headers() {
            proxy_req = proxy_req.set(field.as_str().as_str(), value.as_str());
        }
        let res = match proxy_req.send_bytes(proxy_req_body) {
            Ok(res) => res,
            Err(ureq::Error::Status(_, res)) => res,
            Err(ureq::Error::Transport(te)) => match te.kind() {
                ureq::ErrorKind::BadStatus
                | ureq::ErrorKind::BadHeader
                | ureq::ErrorKind::TooManyRedirects => {
                    incoming_req.respond(Response::new_empty(StatusCode(502)))?;
                    return Ok(());
                }
                ureq::ErrorKind::Io => {
                    incoming_req
                        .respond(Response::new_empty(StatusCode(504 /* timeout */)))?;
                    return Ok(());
                }
                _ => return Err(ureq::Error::Transport(te).into()),
            },
        };
        let headers: Vec<tiny_http::Header> = res
            .headers_names()
            .into_iter()
            .filter_map(|field| {
                let value = res.header(&field)?;
                tiny_http::Header::from_bytes(field.into_bytes(), value).ok()
            })
            .collect();
        let status_code = if (200..500).contains(&res.status()) {
            StatusCode(res.status())
        } else {
            StatusCode(502)
        };
        incoming_req.respond(Response::new(
            status_code,
            headers,
            res.into_reader(),
            None, // data_length
            None, // additional_headers
        ))?;
        Ok(())
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct JsonRpcRequest<'a> {
    /// JSON-RPC version.
    jsonrpc: jsonrpsee_types::TwoPointZero,
    /// Request ID
    #[serde(borrow)]
    pub id: jsonrpsee_types::Id<'a>,
    /// Name of the method to be invoked.
    #[serde(borrow)]
    pub method: beef::Cow<'a, str>,
    /// Parameter values of the request.
    pub params: smallvec::SmallVec<[serde_json::Value; 2]>,
}
