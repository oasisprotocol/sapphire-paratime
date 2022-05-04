use std::lazy::{SyncLazy as Lazy, SyncOnceCell as OnceCell};

use aesm_client::{sgx::AesmClientExt, AesmClient};
use anyhow::{anyhow, Result};
use hmac::{Mac, NewMac};
use p256::pkcs8::der::pem;
use sgx_isa::*;
use sha2::Digest;

static SELF_REPORT: Lazy<Report> = Lazy::new(Report::for_self);
static TARGET_INFO: Lazy<Targetinfo> = Lazy::new(|| Targetinfo::from(SELF_REPORT.clone()));
static TLS_CERT_FINGERPRINT: OnceCell<[u8; 32]> = OnceCell::new();

pub fn tls_secret_key() -> &'static p256::SecretKey {
    static TLS_SECRET_KEY: Lazy<p256::SecretKey> = Lazy::new(|| {
        // The key requires 256 bits of entropy, but a seal key is only 128 bits.
        // Compared to sealing a generated key, this requires less code.
        type Kdf = hmac::Hmac<sha2::Sha512Trunc256>;
        let mut kdf = Kdf::new_from_slice(b"sapphire-encrypting-proxy-tls-key").unwrap();
        let key_req = Keyrequest {
            keyname: Keyname::Seal as _,
            keypolicy: Keypolicy::MRENCLAVE,
            isvsvn: SELF_REPORT.isvsvn,
            cpusvn: SELF_REPORT.cpusvn,
            attributemask: [0xff; 2],
            miscmask: 0xff,
            ..Default::default()
        };
        let key = zeroize::Zeroizing::new(key_req.egetkey().expect("failed to egetkey"));
        kdf.update(&*key);
        let digest = kdf.finalize();
        p256::SecretKey::from_be_bytes(&digest.into_bytes()[..32]).unwrap() // infallible
    });
    &*TLS_SECRET_KEY
}

pub fn record_tls_cert_fingerprint(cert_pem: &[u8]) {
    let (_, cert_der) = pem::decode_vec(cert_pem).expect("failed to parse cert PEM");
    let mut hasher = sha2::Sha256::default();
    hasher.update(&cert_der);
    TLS_CERT_FINGERPRINT
        .set(hasher.finalize().into())
        .expect("TLS cert fingerprint already set");
}

macro_rules! bytes {
    ($src:ident) => {{
        let sl: &[u8] = $src.as_ref();
        let mut bytes = Vec::with_capacity(sl.len());
        bytes.copy_from_slice(sl.as_ref());
        bytes
    }};
}

pub fn get_quote(challenge: [u8; 32]) -> Result<Vec<u8>> {
    let mut report_data = [0u8; 64];
    let (cert_ack, challenge_response) = report_data.split_at_mut(64);
    match TLS_CERT_FINGERPRINT.get() {
        Some(fp) => {
            // The enclave reports what its key is for the client to compare to the TLS cert.
            cert_ack.copy_from_slice(fp);
        }
        None => {
            tracing::warn!(
                "`record_tls_cert_fingerprint` not called. clients cannot verify the TLS cert"
            );
        }
    }
    challenge_response.copy_from_slice(&challenge);
    let report = Report::for_target(&*TARGET_INFO, &report_data);

    let aesm_client = AesmClient::new(std::net::TcpStream::connect("127.0.0.1:23295")?);
    let att_key_ids = aesm_client
        .get_supported_att_key_ids()
        .map_err(|e| anyhow!("failed to get attestation keys: {e}"))?;
    let att_key_id = att_key_ids
        .into_iter()
        .find(|kid| {
            // Taken from https://github.com/fortanix/rust-sgx/blob/6410015/intel-sgx/aesm-client/tests/live_quote.rs
            const ALG_OFFSET: usize = 154;
            let mut alg_id_bytes = [0u8; std::mem::size_of::<u32>()];
            alg_id_bytes.copy_from_slice(&kid[ALG_OFFSET..ALG_OFFSET + 4]);
            let alg_id = u32::from_le_bytes(alg_id_bytes);
            alg_id == 2 // SGX_QL_ALG_ECDSA_P256
        })
        .ok_or_else(|| {
            anyhow!(
                "failed to locate ECDSA attestation key. ECDSA attestation may not be supported"
            )
        })?;
    aesm_client
        .init_quote_ex(att_key_id.clone())
        .map_err(|e| anyhow!("failed to init ECDSA attestation: {e}"))?;
    let quote_result = aesm_client
        .get_quote_ex(att_key_id, bytes!(report), Some(bytes!(TARGET_INFO)), {
            let mut nonce = vec![0u8; 16];
            rand::Rng::fill(&mut rand::rngs::OsRng, nonce.as_mut_slice());
            nonce
        })
        .map_err(|e| anyhow!("failed to get ECDSA quote: {e}"))?;
    // Optionally, verify the `quote_result.qe_report()` to ensure that the AESM isn't faulty.
    Ok(quote_result.quote().to_vec())
}
