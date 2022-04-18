#[derive(serde::Deserialize)]
pub(crate) struct Config {
    /// The server listener `ip:port`.
    #[serde(default = "default_listen_addr")]
    pub(crate) listen_addr: String,

    #[serde(default)]
    pub(crate) tls: bool,

    /// The URL of the upstream Web3 gateway (TLS optional).
    pub(crate) upstream: url::Url,

    /// The public key of the Sapphire ParaTime.
    #[serde(
        alias = "paratime_public_key",
        deserialize_with = "hex::serde::deserialize"
    )]
    pub(crate) runtime_public_key: [u8; 32],
}

impl Config {
    pub(crate) fn load() -> Result<Self, config::ConfigError> {
        config::ConfigBuilder::<config::builder::DefaultState>::default()
            .add_source(config::Environment::with_prefix("SAPPHIRE_PROXY"))
            .build()?
            .try_deserialize()
    }
}

fn default_listen_addr() -> String {
    "127.0.0.1:23294".into()
}
