use std::{
    collections::HashSet,
    sync::{
        atomic::{AtomicBool, Ordering::SeqCst},
        Arc, RwLock,
    },
};

use jsonwebkey::JsonWebKey;

pub(crate) struct ChallengeResponseServer {
    server: tiny_http::Server,
    /// base64url-encoded thumbprint of the ACME account JWK.
    account_key_thumbprint: String,
    tokens: RwLock<HashSet<String>>,
    shutdown_signal: Arc<AtomicBool>,
}

impl ChallengeResponseServer {
    fn new(listen_addr: &str, account_key_thumbprint: String) -> Arc<Self> {
        Arc::new(Self {
            server: tiny_http::Server::http(listen_addr).unwrap(),
            account_key_thumbprint,
            tokens: Default::default(),
            shutdown_signal: Default::default(),
        })
    }

    fn serve(&self) {
        loop {
            if self.shutdown_signal.load(SeqCst) {
                break;
            }
            let req = match self.server.recv() {
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

            macro_rules! respond {
                ($status_code:literal$(, $data:expr)?) => {{
                    use tiny_http::{Response, StatusCode};
                    let res = Response::new_empty(StatusCode($status_code))
                        $(.with_data($data, Some($data.len())))?;
                    if let Err(e) = req.respond(res) {
                        tracing::error!(error=%e, "error responding to request");
                    }
                    continue;
                }}
            }

            let token = match req.url().strip_prefix("/.well-known/acme-challenge/") {
                Some(token) => token,
                None => respond!(404),
            };
            let has_token = {
                let tokens = self.tokens.read().unwrap();
                tokens.contains(token)
                // drop the lock asap
            };
            if !has_token {
                respond!(404);
            }
            let challenge_response = format!("{token}.{}", self.account_key_thumbprint);
            respond!(200, challenge_response.as_bytes());
        }
    }

    fn shutdown(&self) {
        self.shutdown_signal.store(true, SeqCst);
        self.server.unblock();
    }
}

pub(crate) fn get_or_create_tls_cert(
    config: crate::config::AcmeConfig,
) -> Result<tiny_http::SslConfig, Error> {
    let account_key_thumbprint = String::new();
    let challenge_response_server = ChallengeResponseServer::new(
        &config.challenge_responder_listen_addr,
        account_key_thumbprint,
    );
    let server_thread = std::thread::spawn({
        let server = challenge_response_server.clone();
        move || server.serve()
    });

    // 1. Retrieve account key and TLS private key.
    // 2. Create account, if needed.
    // 3. Initiate order.
    // 4. Start handling challenges.
    // 5. Finalize order.
    // 6. Post-process certificate.

    challenge_response_server.shutdown();
    #[allow(clippy::expect_used)]
    server_thread
        .join()
        .expect("challenge responder encountered an error");

    Ok(tiny_http::SslConfig {
        certificate: vec![],
        private_key: vec![],
    })
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum Error {}
