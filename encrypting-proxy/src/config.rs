#[derive(Debug, serde::Deserialize)]
pub struct Config {
    /// The server listener `ip:port`.
    #[serde(default = "default_listen_addr")]
    pub listen_addr: String,

    #[serde(default)]
    pub tls: bool,

    /// The URL of the upstream Web3 gateway (TLS optional).
    #[serde(default = "default_upstream")]
    pub upstream: url::Url,

    #[serde(default = "default_max_request_size_bytes")]
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
            listen_addr: default_listen_addr(),
            tls: false,
            upstream: default_upstream(),
            max_request_size_bytes: default_max_request_size_bytes(),
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

fn default_listen_addr() -> String {
    "127.0.0.1:23294".into()
}

fn default_upstream() -> url::Url {
    #[allow(clippy::unwrap_used)]
    "http://127.0.0.1:8545".parse().unwrap()
}

pub(crate) fn default_max_request_size_bytes() -> usize {
    1024 * 1024
}
