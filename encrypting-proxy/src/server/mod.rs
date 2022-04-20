mod handler;

use std::sync::Arc;

use bumpalo::Bump;
use tiny_http::{Method, StatusCode};

use crate::cipher::SessionCipher;

pub(crate) use handler::{upstream::Web3GatewayUpstream, RequestHandler};

pub struct Server {
    server: tiny_http::Server,
    handler: RequestHandler<SessionCipher, Web3GatewayUpstream>,
    is_tls: bool,
}

impl Server {
    pub fn new(
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

    pub fn serve(&self) -> ! {
        loop {
            let mut req = match self.server.recv() {
                Ok(req) => req,
                Err(_) => continue,
            };

            let req_span = tracing::info_span!(
                "request",
                method=%req.method(),
                path=req.url(),
                remote_addr=%req.remote_addr(),
                content_length=req.body_length().unwrap_or_default(),
            );
            let _in_req_span = req_span.enter();

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

            const ROUTE_WEB3: &'static str = "/";
            const ROUTE_QUOTE: &'static str = "/quote";

            macro_rules! respond {
                ($res:expr) => {{
                    if let Err(e) = req.respond($res) {
                        tracing::error!(error=%e, "error responding to request");
                    }
                }}
            }

            match (req.url(), req.method()) {
                (ROUTE_WEB3, Method::Options) | (ROUTE_QUOTE, Method::Options) => {
                    respond!(res.with_status_code(StatusCode(204)));
                }

                (ROUTE_WEB3, Method::Post) => {
                    let res = with_headers!(res, { "content-type": "application/json" });

                    with_alloc(|alloc| {
                        let mut proxy_res_buf = Vec::new_in(alloc); // will be resized in `fn proxy`
                        let mut req_buf = Vec::new_in(alloc); // will be resized in `fn handle_req`
                        let mut res_buf =
                            Vec::with_capacity_in(1024 /* rough estimate */, alloc);
                        #[allow(clippy::unwrap_used)]
                        match self
                            .handler
                            .handle_req(&mut req, &mut req_buf, &mut proxy_res_buf, alloc)
                            .as_ref()
                        {
                            Ok(res_data) => serde_json::to_writer(&mut res_buf, res_data),
                            Err(res_data) => serde_json::to_writer(&mut res_buf, res_data),
                        }
                        .unwrap(); // OOM or something bad
                        respond!(res.with_data(res_buf.as_slice(), Some(res_buf.len())));
                    })
                }

                (ROUTE_QUOTE, Method::Get) => {
                    #[cfg(target_env = "sgx")]
                    {
                        with_alloc(|alloc| match crate::attestation::get_quote(alloc) {
                            Ok(quote) => {
                                respond!(res.with_data(quote.as_slice(), Some(quote.len())))
                            }
                            Err(e) => {
                                tracing::error!(error=?e, "failed to retrieve quote");
                                respond!(res.with_status_code(StatusCode(500)));
                            }
                        })
                    }
                    #[cfg(not(target_env = "sgx"))]
                    respond!(res.with_status_code(StatusCode(204)));
                }

                (ROUTE_WEB3, _) | (ROUTE_QUOTE, _) => {
                    respond!(res.with_status_code(StatusCode(405)));
                }

                (_, _) => {
                    respond!(res.with_status_code(StatusCode(404)));
                }
            }
        }
    }
}

fn with_alloc<T>(f: impl FnOnce(&Bump) -> T) -> T {
    thread_local!(static BUMP: std::cell::RefCell<Bump> = Default::default());
    BUMP.with(|bump_cell| {
        let mut bump = bump_cell.borrow_mut();
        let outcome = f(&bump);
        bump.reset();
        outcome
    })
}
