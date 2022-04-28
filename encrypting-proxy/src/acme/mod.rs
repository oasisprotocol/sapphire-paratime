mod challenge_responder;
mod client;

use jsonwebkey::{self as jwk, JsonWebKey};

pub(crate) fn get_or_create_tls_cert(
    config: crate::config::AcmeConfig,
) -> Result<tiny_http::SslConfig, Error> {
    let account_key = JsonWebKey::new(jwk::Key::generate_symmetric(32)); // TODO
    let account_key_thumbprint = account_key.key.thumbprint();
    let challenge_response_server = challenge_responder::ChallengeResponseServer::new(
        &config.challenge_responder_listen_addr,
        account_key_thumbprint,
    );
    let server_thread = std::thread::spawn({
        let server = challenge_response_server.clone();
        move || server.serve()
    });

    let mut order = client::AcmeClientConnector::new(config.acme_provider_url, account_key)
        .connect()?
        .order_certificate(config.domains)?;
    for challenge in order.challenges() {
        let challenge = challenge?;
        challenge_response_server.register_token(challenge.token());
        challenge.wait_for_validation()?;
    }

    challenge_response_server.shutdown();
    server_thread
        .join()
        .expect("challenge responder encountered an error");

    let tls_cert = order.complete(vec![] /* TODO: generate CSR */)?;

    Ok(tiny_http::SslConfig {
        certificate: tls_cert,
        private_key: vec![],
    })
}

#[derive(Debug, thiserror::Error)]
#[allow(clippy::large_enum_variant)]
pub(crate) enum Error {
    #[error(transparent)]
    Http(#[from] ureq::Error),

    #[error("could not process HTTP response: {0}")]
    HttpResponse(#[from] std::io::Error),

    #[error("signature error: {0}")]
    Signature(#[from] jsonwebtoken::errors::Error),

    #[error("ACME protocol error: {0}")]
    Protocol(String),

    #[error("ACME authorization did not have an http-01 challenge, so it could not be completed")]
    NoHttp01Challenge,

    #[error("challenge resulted in invalid status")]
    ChallengeFailed,
}
