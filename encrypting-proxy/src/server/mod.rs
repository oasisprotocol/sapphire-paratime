mod handler;

use std::sync::Arc;

use bumpalo::Bump;
use tiny_http::StatusCode;

use crate::cipher::SessionCipher;

use handler::{upstream::Web3GatewayUpstream, RequestHandler};

pub(crate) struct Server {
    server: tiny_http::Server,
    handler: RequestHandler<SessionCipher, Web3GatewayUpstream>,
    is_tls: bool,
}

impl Server {
    pub(crate) fn new(
        config: crate::config::Config,
    ) -> Result<Arc<Self>, std::boxed::Box<dyn std::error::Error + Send + Sync + 'static>> {
        let server_cfg = tiny_http::ServerConfig {
            addr: &config.listen_addr,
            ssl: None, // TODO: fetch from letsencrypt or other provider
        };
        Ok(Arc::new(Self {
            server: tiny_http::Server::new(server_cfg)?,
            is_tls: config.tls,
            #[allow(clippy::unwrap_used)]
            handler: RequestHandler::new(
                SessionCipher::from_runtime_public_key(config.runtime_public_key),
                Web3GatewayUpstream::new(config.upstream),
                config.max_request_size_bytes,
            ),
        }))
    }

    pub(crate) fn serve(&self) -> ! {
        loop {
            let mut req = match self.server.recv() {
                Ok(req) => req,
                Err(_) => continue,
            };
            macro_rules! with_headers {
                ($res:expr, { $($name:literal: $value:literal),+ $(,)? }) => {
                    $res$(
                    .with_header(
                        tiny_http::Header::from_bytes($name.as_bytes(), $value.as_bytes()).unwrap()
                    )
                    )+
                }
            }

            let res = with_headers!(tiny_http::Response::new_empty(StatusCode(200)), {
                "access-control-allow-origin": "*",
                "access-control-allow-methods": "POST,OPTIONS",
                "access-control-allow-headers": "content-type",
                "access-control-max-age": "86400",
            });

            if self.is_tls && !req.secure() {
                req.respond(res.with_status_code(StatusCode(421))).ok();
                continue;
            }

            match &req.method() {
                tiny_http::Method::Options => {
                    req.respond(res.with_status_code(StatusCode(204))).ok();
                    continue;
                }
                tiny_http::Method::Post => {}
                _ => {
                    req.respond(res.with_status_code(StatusCode(405))).ok();
                    continue;
                }
            }

            let res = with_headers!(res, { "content-type": "application/json" });

            thread_local!(static BUMP: std::cell::RefCell<Bump> = Default::default());
            BUMP.with(|bump_cell| {
                let mut bump = bump_cell.borrow_mut();
                {
                    let mut proxy_res_buf = Vec::new_in(&*bump); // will be resized in `fn proxy`
                    let mut req_buf = Vec::new_in(&*bump); // will be resized in `fn handle_req`
                    let mut res_buf = Vec::with_capacity_in(1024 /* rough estimate */, &*bump);
                    #[allow(clippy::unwrap_used)]
                    match self
                        .handler
                        .handle_req(&mut req, &mut req_buf, &mut proxy_res_buf, &*bump)
                        .as_ref()
                    {
                        Ok(res_data) => serde_json::to_writer(&mut *res_buf, res_data),
                        Err(res_data) => serde_json::to_writer(&mut *res_buf, res_data),
                    }
                    .unwrap(); // OOM or something bad
                    let res = res.with_data(res_buf.as_slice(), Some(res_buf.len()));
                    if let Err(e) = req.respond(res) {
                        tracing::error!(error=%e, "error responding to request");
                    }
                }
                bump.reset();
            });
        }
    }
}
