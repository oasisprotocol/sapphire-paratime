use std::{
    io::{BufReader, Read, Write},
    lazy::{SyncLazy as Lazy, SyncOnceCell as OnceCell},
};

use anyhow::Result;
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

pub fn get_quote(challenge: [u8; 32]) -> Result<Vec<u8>> {
    get_quote_in(challenge, std::alloc::Global)
}

pub(crate) fn get_quote_in<A: std::alloc::Allocator>(
    challenge: [u8; 32],
    alloc: A,
) -> Result<Vec<u8, A>> {
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

    let mut quoter = BufReader::new(std::net::TcpStream::connect("dcap-quote")?);
    quoter.get_mut().write_all(report.as_ref())?;
    let mut quote_len_bytes = [0u8; std::mem::size_of::<u16>()];
    quoter.read_exact(&mut quote_len_bytes)?;
    let quote_len = u16::from_le_bytes(quote_len_bytes) as usize;
    anyhow::ensure!(quote_len < 4096, "received unexpectedly large quote");
    let mut quote = Vec::with_capacity_in(quote_len, alloc);
    quoter.read_exact(&mut quote)?;
    Ok(quote)
}
