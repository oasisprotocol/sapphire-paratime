use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct Config {
    /// The server listener `ip:port`.
    #[serde(default = "defaults::listen_addr")]
    pub listen_addr: String,

    /// If set, the server will fetch and preset a TLS certificate from an ACME provider.
    /// All requests made to this server will require TLS.
    #[serde(default)]
    pub tls: Option<AcmeConfig>,

    /// The URL of the upstream Web3 gateway (TLS optional).
    #[serde(default = "defaults::upstream")]
    pub upstream: url::Url,

    #[serde(default = "defaults::max_request_size_bytes")]
    pub max_request_size_bytes: usize,

    /// The public key of the Sapphire ParaTime.
    #[serde(
        alias = "paratime_public_key",
        deserialize_with = "hex::serde::deserialize"
    )]
    pub runtime_public_key: [u8; 32],
}

impl Default for Config {
    fn default() -> Self {
        Self {
            listen_addr: defaults::listen_addr(),
            tls: None,
            upstream: defaults::upstream(),
            max_request_size_bytes: defaults::max_request_size_bytes(),
            runtime_public_key: [0; 32],
        }
    }
}

impl Config {
    pub fn load() -> Result<Self, config::ConfigError> {
        config::ConfigBuilder::<config::builder::DefaultState>::default()
            .add_source(config::Environment::with_prefix("SAPPHIRE_PROXY"))
            .build()?
            .try_deserialize()
    }
}

#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct AcmeConfig {
    /// The listen address of the server that responds to HTTP challenge requests. This server
    /// will need to be exposed on port 80 on the host pointed to by the specified `domain`.
    #[serde(
        rename = "challenge_responder_listen_addr",
        default = "defaults::listen_addr"
    )]
    pub challenge_responder_listen_addr: String,

    /// The URL of the ACME provider to use for generating the server TLS certificate.
    #[serde(default = "defaults::acme_provider_url")]
    pub acme_provider_url: url::Url,

    /// The domain name of the host where this instance is running.
    pub domain: String,
}

impl Default for AcmeConfig {
    fn default() -> Self {
        Self {
            challenge_responder_listen_addr: defaults::listen_addr(),
            acme_provider_url: defaults::acme_provider_url(),
            domain: defaults::listen_addr(),
        }
    }
}

#[allow(clippy::unwrap_used)]
mod defaults {
    pub(super) fn listen_addr() -> String {
        "127.0.0.1:23294".into()
    }

    pub(super) fn upstream() -> url::Url {
        "http://127.0.0.1:8545".parse().unwrap()
    }

    pub(super) fn max_request_size_bytes() -> usize {
        1024 * 1024
    }

    pub(super) fn acme_provider_url() -> url::Url {
        "https://acme-v02.api.letsencrypt.org/acme".parse().unwrap()
    }
}
