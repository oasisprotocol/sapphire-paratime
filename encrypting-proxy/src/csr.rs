use std::iter::once;

use anyhow::{anyhow, Result};
use der::{asn1::BitString, Decodable};
use p256::{
    ecdsa::{signature::Signer, SigningKey},
    elliptic_curve::{sec1::ToEncodedPoint, AlgorithmParameters},
    NistP256,
};
use spki::{AlgorithmIdentifier, SubjectPublicKeyInfo};
use x509_cert::{
    name::RdnSequence,
    request::{CertReq, CertReqInfo, Version},
};

/// Generates a CSR for the subject info signed by the secret_key.
///
/// The subject info is as specified in https://datatracker.ietf.org/doc/html/rfc4514.
/// For example:
/// `C=US,ST=California,L=San Francisco,O=Oasis Labs,CN=sapphire-proxy.oasislabs.com`
pub fn generate(secret_key: &p256::SecretKey, subject_info: &str) -> Result<Vec<u8>> {
    let public_key = secret_key.public_key();
    let public_key_bytes = public_key.to_encoded_point(false /* compressed */);

    let rdn_der = RdnSequence::encode_from_string(subject_info)
        .map_err(|e| anyhow!("invalid subject info: {e}"))?;
    let subject = RdnSequence::from_der(&rdn_der).unwrap();

    let cert_req_info = CertReqInfo {
        version: Version::V1,
        subject,
        public_key: SubjectPublicKeyInfo {
            algorithm: {
                let alg_old = NistP256::algorithm_identifier();
                // Convert the type from spki stable to the alpha version used by `x509-cert`.
                AlgorithmIdentifier {
                    oid: alg_old.oid.as_bytes().try_into().unwrap(),
                    parameters: alg_old.parameters.map(|p| {
                        use p256::pkcs8::der::Tagged;
                        der::asn1::Any::new(p.tag().octet().try_into().unwrap(), p.value()).unwrap()
                    }),
                }
            },
            subject_public_key: public_key_bytes.as_ref(),
        },
        attributes: Default::default(),
    };

    let mut der_buf = vec![0u8; 1024]; // Should be plenty.
    let req_info_der = der_encode(&cert_req_info, &mut der_buf)
        .map_err(|e| anyhow!("failed to encode CSR info: {e}"))?;

    let signature = SigningKey::from(secret_key).sign(req_info_der).to_der();

    let cert_req = CertReq {
        info: cert_req_info,
        algorithm: AlgorithmIdentifier {
            oid: "1.2.840.10045.4.3.2".parse().unwrap(), // ecdsa-with-SHA256
            parameters: None,
        },
        signature: BitString::from_bytes(signature.as_ref())
            .map_err(|e| anyhow!("failed to encode signature: {e}"))?,
    };

    let cert_req_der =
        der_encode(&cert_req, &mut der_buf).map_err(|e| anyhow!("failed to encode CSR: {e}"))?;
    let cert_req_b64 = base64::encode(cert_req_der).into_bytes();
    let cert_req_pem = once("-----BEGIN CERTIFICATE REQUEST-----\n".as_bytes())
        .chain(cert_req_b64.chunks(64).intersperse(b"\n"))
        .chain(once("\n-----END CERTIFICATE REQUEST-----".as_bytes()))
        .flatten()
        .copied()
        .collect();
    Ok(cert_req_pem)
}

fn der_encode<'a, T: der::Encodable>(t: &T, buf: &'a mut [u8]) -> der::Result<&'a [u8]> {
    let mut encoder = der::Encoder::new(buf);
    encoder.encode(t)?;
    encoder.finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verify_csr() -> Result<()> {
        let secret_key = p256::SecretKey::random(&mut rand::thread_rng());
        let csr = generate(
            &secret_key,
            "C=US,ST=California,L=San Francisco,O=Oasis Labs,CN=sapphire-proxy.oasislabs.com",
        )?;
        let mut cp = std::process::Command::new("openssl")
            .args(["req", "-verify", "-noout"])
            .stdin(std::process::Stdio::piped())
            .spawn()?;
        {
            std::io::Write::write_all(&mut cp.stdin.take().unwrap(), &csr)?;
        }
        assert!(cp.wait()?.success());
        Ok(())
    }
}
