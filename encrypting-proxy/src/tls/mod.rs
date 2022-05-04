pub mod csr;

#[cfg(target_env = "sgx")]
pub fn load_secret_key() -> &'static p256::SecretKey {
    crate::sgx::tls_secret_key()
}

#[cfg(not(target_env = "sgx"))]
pub fn load_secret_key_from(sec1_pem_path: &std::path::Path) -> anyhow::Result<p256::SecretKey> {
    let secret_key_pem = std::fs::read_to_string(sec1_pem_path).map_err(|e| {
        anyhow::Error::from(e).context(format!("could not read {}", sec1_pem_path.display()))
    })?;
    p256::SecretKey::from_sec1_pem(&secret_key_pem)
        .map_err(|_| anyhow::anyhow!("invalid private key"))
}
