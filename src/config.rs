#[derive(serde::Deserialize)]
pub(crate) struct Config {
    /// The server listener `ip:port`.
    #[serde(default = "default_listen_addr")]
    pub(crate) listen_addr: String,

    #[serde(default)]
    pub(crate) tls: bool,
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
