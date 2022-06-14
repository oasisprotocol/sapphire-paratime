const ENV_PREFIX: &str = "SAPPHIRE_PROXY";

macro_rules! emit_env {
    ($name:literal, $value:expr) => {
        println!("cargo:rustc-env={ENV_PREFIX}_{}={}", $name, $value);
    };
}

fn main() {
    let mf = cargo_toml::Manifest::from_path("Cargo.toml").unwrap();
    let fortanix_metadata: FortanixMetadata = mf
        .package
        .as_ref()
        .and_then(|p| p.metadata.as_ref())
        .and_then(|m| m.get("fortanix-sgx"))
        .and_then(|fm| fm.clone().try_into().ok())
        .expect("missing or invalid [package.metadata.fortanix-sgx]");

    emit_env!("NUM_THREADS", fortanix_metadata.threads);
    emit_env!(
        "STACK_SIZE_BYTES",
        fortanix_metadata.stack_size / fortanix_metadata.threads
    );
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
struct FortanixMetadata {
    threads: usize,
    stack_size: usize,
}
