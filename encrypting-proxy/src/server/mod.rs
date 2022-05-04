mod handler;

use std::sync::Arc;

use bumpalo::Bump;
use tiny_http::{Method, StatusCode};

use crate::crypto::SessionCipher;

pub(crate) use handler::{upstream::Web3GatewayUpstream, RequestHandler};

pub struct Server {
    server: tiny_http::Server,
    handler: RequestHandler<SessionCipher, Web3GatewayUpstream>,
    require_tls: bool,
}

impl Server {
    pub fn new(
        config: Config,
    ) -> Result<Arc<Self>, std::boxed::Box<dyn std::error::Error + Send + Sync + 'static>> {
        let require_tls = config.tls.is_some();
        let server_cfg = tiny_http::ServerConfig {
            addr: &config.listen_addr,
            ssl: config.tls.map(|t| tiny_http::SslConfig {
                private_key: t.secret_key,
                certificate: t.certificate,
            }),
        };
        Ok(Arc::new(Self {
            server: tiny_http::Server::new(server_cfg)?,
            require_tls,
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

            let _req_span = tracing::info_span!(
                "request",
                method=%req.method(),
                path=req.url(),
                remote_addr=%req.remote_addr(),
                content_length=req.body_length().unwrap_or_default(),
            )
            .entered();

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

            macro_rules! respond {
                ($res:expr, $status:literal) => {
                    respond!($res.with_status_code(StatusCode($status)))
                };
                ($res:expr) => {{
                    if let Err(e) = req.respond($res) {
                        tracing::error!(error=%e, "error responding to request");
                    }
                }};
            }
            macro_rules! respond_and_continue {
                ($res:expr$(, $status:literal)?) => {{
                    respond!($res$(, $status)?);
                    continue;
                }};
            }

            if self.require_tls && !req.secure() {
                respond_and_continue!(res, 421);
            }

            const ROUTE_WEB3: &str = "/";
            /// Returns a report that can be used for local attestation, or sent to the QE
            /// to turn into a Quote for remote attestation.
            const ROUTE_REPORT: &str = "/report";

            if req.url() == ROUTE_WEB3 || !(cfg!(target_env = "sgx") && req.url() == ROUTE_REPORT) {
                respond_and_continue!(res, 404);
            }

            if *req.method() == Method::Options {
                respond_and_continue!(res, 204);
            }

            macro_rules! route {
                ($method:ident, $path:ident, |$alloc:ident| $handler:block) => {{
                    if req.url() == $path {
                        if *req.method() != Method::$method {
                            respond_and_continue!(res, 405);
                        }
                        with_alloc(|$alloc| $handler);
                        continue;
                    }
                }};
            }

            route!(Post, ROUTE_WEB3, |alloc| {
                let mut proxy_res_buf = Vec::new_in(alloc); // will be resized in `fn proxy`
                let mut req_buf = Vec::new_in(alloc); // will be resized in `fn handle_req`
                let mut res_buf = Vec::with_capacity_in(1024 /* rough estimate */, alloc);
                match self
                    .handler
                    .handle_req(&mut req, &mut req_buf, &mut proxy_res_buf, alloc)
                    .as_ref()
                {
                    Ok(res_data) => serde_json::to_writer(&mut res_buf, res_data),
                    Err(res_data) => serde_json::to_writer(&mut res_buf, res_data),
                }
                .unwrap(); // OOM or something bad
                respond!(with_headers!(res, { "content-type": "application/json" })
                    .with_data(res_buf.as_slice(), Some(res_buf.len())))
            });

            #[cfg(target_env = "sgx")]
            route!(Get, ROUTE_REPORT, |alloc| {
                macro_rules! respond_err {
                    ($status:literal, $msg:expr) => {{
                        let mut res_buf = Vec::with_capacity_in(256, alloc);
                        serde_json::to_writer(&mut res_buf, &serde_json::json!({ "error": $msg }))
                            .unwrap();
                        respond!(res
                            .with_status_code(StatusCode($status))
                            .with_data(res_buf.as_slice(), Some(res_buf.len())))
                    }};
                }

                const CHALLENGE_PARAM: &str = "challenge=";
                const CHALLENGE_B64_LEN: usize = 43;
                let req_url = req.url();
                let challenge_str = match req.url().find(CHALLENGE_PARAM) {
                    Some(pos) => {
                        let start = pos + CHALLENGE_PARAM.len();
                        &req_url[start..(start + CHALLENGE_B64_LEN)]
                    }
                    None => {
                        respond_err!(400, "missing challenge query param");
                        return;
                    }
                };
                if challenge_str.len() != CHALLENGE_B64_LEN {
                    respond_err!(
                        400,
                        "invalid challenge. expected 32 base64url-encoded bytes"
                    );
                    return;
                }
                let mut challenge = [0u8; 32];
                if let Err(e) = base64::decode_config_slice(
                    challenge_str,
                    base64::URL_SAFE_NO_PAD,
                    &mut challenge,
                ) {
                    respond_err!(400, format!("invalid challenge: {e}"));
                    return;
                }
                let report = crate::sgx::get_report(challenge);
                let report_bytes: &[u8] = report.as_ref();
                respond!(res.with_data(report_bytes, Some(report_bytes.len())))
            });
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

#[derive(Debug)]
pub struct Config {
    /// The server listen address `ip:port`.
    pub listen_addr: std::net::SocketAddr,

    /// If set, the server will require all connections to use TLS.
    pub tls: Option<TlsConfig>,

    /// The URL of the upstream Web3 gateway (TLS optional).
    pub upstream: url::Url,

    /// The maximum size of a Web3 request.
    pub max_request_size_bytes: usize,

    /// The public key of the Sapphire ParaTime.
    pub runtime_public_key: [u8; 32],
}

#[derive(Debug)]
pub struct TlsConfig {
    pub secret_key: Vec<u8>,
    pub certificate: Vec<u8>,
}
