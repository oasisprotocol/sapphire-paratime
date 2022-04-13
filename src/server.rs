use std::{cell::RefCell, io::Read, sync::Arc};

use bytes::{BufMut, Bytes, BytesMut};
use jsonrpsee_types::request::Request as Web3Req;
use tiny_http::{Header, Response, StatusCode};

use crate::req_tester::{RequestClass, RequestTester};

const MAX_REQUEST_SIZE_BYTES: usize = 1024 * 1024; // 1 MiB

pub(crate) struct Server {
    server: tiny_http::Server,
    config: crate::config::Config,
    req_tester: RequestTester,
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
        thread_local! {
            static BODY_BUF: RefCell<BytesMut> =
                RefCell::new(BytesMut::with_capacity(MAX_REQUEST_SIZE_BYTES));
        }
        if self.config.tls && !req.secure() {
            req.respond(Response::new_empty(StatusCode(421)))?;
            return Ok(());
        }

        let body_bytes: Bytes = match BODY_BUF.with(|body_buf| {
            let mut body_buf = body_buf.borrow_mut();
            body_buf.clear();
            let mut req_rdr = req.as_reader().take(MAX_REQUEST_SIZE_BYTES as u64);
            let bytes_read = std::io::copy(&mut req_rdr, &mut body_buf.clone().writer())?;
            Ok::<_, std::io::Error>(body_buf.split_to(bytes_read as usize).freeze())
        }) {
            Ok(body_bytes) => body_bytes,
            Err(_) => {
                req.respond(Response::new_empty(StatusCode(400)))?;
                return Ok(());
            }
        };

        match self.req_tester.preflight(&body_bytes) {
            RequestClass::NonConfidential => {
                todo!("proxy to upstream");
            }
            RequestClass::Confidential => {}
            RequestClass::Disallowed => {
                req.respond(Response::new_empty(StatusCode(400)))?;
                return Ok(());
            }
        }

        let web3_req: Web3Req<'_> = match serde_json::from_slice(&body_bytes) {
            Ok(req) => req,
            Err(_) => {
                req.respond(Response::new_empty(StatusCode(400)))?;
                return Ok(());
            }
        };

        match self.req_tester.test(&web3_req.method) {
            RequestClass::Confidential => {}
            RequestClass::NonConfidential => {
                todo!("proxy to upstream");
            }
            RequestClass::Disallowed => {
                req.respond(Response::new_empty(StatusCode(400)))?;
                return Ok(());
            }
        }

        let web3_req_params_str = match web3_req.params.as_ref().map(|p| p.get()) {
            Some(params_str) => params_str,
            None => {
                req.respond(Response::new_empty(StatusCode(400)))?;
                return Ok(());
            }
        };
        let web3_req_params: serde_json::Value = serde_json::from_str(web3_req_params_str)?;
        // match serde_json::from_str::<Web3Req>(req.)
        Ok(())
    }
}
