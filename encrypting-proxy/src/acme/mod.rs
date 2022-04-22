mod challenge_responder;
mod client;

use jsonwebkey::JsonWebKey;

pub(crate) fn get_or_create_tls_cert(
    config: crate::config::AcmeConfig,
) -> Result<tiny_http::SslConfig, Error> {
    let account_key_thumbprint = String::new();
    let challenge_response_server = challenge_responder::ChallengeResponseServer::new(
        &config.challenge_responder_listen_addr,
        account_key_thumbprint,
    );
    let server_thread = std::thread::spawn({
        let server = challenge_response_server.clone();
        move || server.serve()
    });

    let client = client::AcmeClient::new(config.acme_provider_url);

    // 2. Retrieve account key and TLS private key.

    // 4. Initiate order.
    // 5. Start handling challenges.
    // 6. Finalize order.
    // 7. Post-process certificate.

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

fn get_nonce(res: &ureq::Response) -> Result<&str, Error> {
    res.header("replay-nonce")
        .ok_or(Error::Protocol("failed to obtain replay-nonce"))
}

#[derive(Debug, thiserror::Error)]
#[allow(clippy::large_enum_variant)]
pub(crate) enum Error {
    #[error(transparent)]
    Http(#[from] ureq::Error),

    #[error("ACME protocol error: {0}")]
    Protocol(&'static str),
}
