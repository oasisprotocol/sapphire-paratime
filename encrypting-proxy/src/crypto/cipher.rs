#![forbid(unused_variables, unsafe_code)] // Make it harder to forget to use a byte slice.

use std::sync::atomic::{AtomicU64, Ordering::SeqCst};

use deoxysii::{DeoxysII, NONCE_SIZE, TAG_SIZE};
use hmac::{Mac, NewMac};

type Kdf = hmac::Hmac<sha2::Sha512Trunc256>;
type Nonce = [u8; deoxysii::NONCE_SIZE];
pub type RequestId = u64;

const REQ_ID_SIZE: usize = std::mem::size_of::<u64>();

pub trait Cipher {
    /// The size of the additional items sent to the runtime.
    const TX_CT_OVERHEAD: usize;
    /// The size of the additional items returned from the runtime.
    const RX_CT_OVERHEAD: usize;

    /// Encrypts `pt` into `ct`, returning a request id that the server is expected
    /// to copy into the response, and that the caller is expected to pass to `decrypt_into`.
    /// This function panics if `ct` is smaller than `request_ct_len(pt.len())`.
    fn encrypt_into(&self, pt: &[u8], ct: &mut [u8]) -> RequestId;

    /// The size of the (encrypted) request message.
    fn request_ct_len(pt_len: usize) -> usize {
        pt_len
            .checked_add(Self::TX_CT_OVERHEAD)
            .expect("request is much to large")
    }

    /// Decrypts `ct` into `pt`, checking that the request ID included with the response message
    /// matches the provided `request_id`.
    /// This function panics if `pt` is smaller than `response_pt_len(ct.len())`.
    /// Returns whether the decryption was successful.
    #[must_use]
    fn decrypt_into(&self, request_id: RequestId, ct: &mut [u8], pt: &mut [u8]) -> bool;

    /// The size of the plaintext response message after decryption.
    fn response_pt_len(ct_len: usize) -> usize {
        ct_len.saturating_sub(Self::RX_CT_OVERHEAD)
    }
}

pub struct SessionCipher {
    keypair: KeyPair,
    deoxysii: DeoxysII,
    nonce: AtomicU64,
}

impl SessionCipher {
    const PUBLIC_KEY_SIZE: usize = 32;

    pub fn from_runtime_public_key(runtime_public_key: [u8; Self::PUBLIC_KEY_SIZE]) -> Self {
        let runtime_public_key = x25519_dalek::PublicKey::from(runtime_public_key);
        let keypair = KeyPair::generate();
        let deoxysii = DeoxysII::new(&Self::derive_symmetric_key(
            &runtime_public_key,
            &keypair.secret,
        ));
        Self {
            keypair,
            deoxysii,
            nonce: AtomicU64::new(1), // Set to 1 so that 0 is a sentinel for overflow.
        }
    }

    /// Derives a MRAE AEAD symmetric key suitable for use with the asymmetric
    /// box primitives from the provided X25519 public and private keys.
    // This method is taken directly without modification from
    // `oasis_core_runtime::common::crypto::mrae::deoxysii`. Do not change it
    // unless you want to add tests.
    fn derive_symmetric_key(
        runtime_public_key: &x25519_dalek::PublicKey,
        secret_key: &x25519_dalek::StaticSecret,
    ) -> [u8; deoxysii::KEY_SIZE] {
        let pmk = secret_key.diffie_hellman(runtime_public_key);
        let mut kdf = Kdf::new_from_slice(b"MRAE_Box_Deoxys-II-256-128").unwrap();
        kdf.update(pmk.as_bytes());
        drop(pmk);
        let mut derived_key = [0u8; deoxysii::KEY_SIZE];
        let digest = kdf.finalize();
        derived_key.copy_from_slice(&digest.into_bytes()[..deoxysii::KEY_SIZE]);
        derived_key
    }
}

impl Cipher for SessionCipher {
    const TX_CT_OVERHEAD: usize = NONCE_SIZE + TAG_SIZE + Self::PUBLIC_KEY_SIZE + 1 /* version byte */;
    const RX_CT_OVERHEAD: usize = NONCE_SIZE + TAG_SIZE + 1 /* version byte */;

    // `enveloped_tagged_ct` has format:
    //    version:u8 || nonce:[u8;15] || rx_pub_key:[u8;32] || tagged_ciphertext
    fn encrypt_into(&self, pt: &[u8], enveloped_tagged_ct: &mut [u8]) -> RequestId {
        let output_len = Self::request_ct_len(pt.len());
        if enveloped_tagged_ct.len() < output_len {
            panic!(
                "`enveloped_tagged_ct` needed length at least {output_len} but was only {}",
                enveloped_tagged_ct.len()
            );
        }

        let req_id = self.nonce.fetch_add(1, SeqCst);
        assert!(req_id != 0, "nonce overflowed. time to reboot");
        let tx_nonce = req_id_to_tx_nonce(req_id);

        let metadata_len = 1 + NONCE_SIZE + Self::PUBLIC_KEY_SIZE;
        let (metadata, tagged_ct) = enveloped_tagged_ct.split_at_mut(metadata_len);
        let (version, nonce_and_keypair) = metadata.split_first_mut().unwrap();
        let (nonce_bytes, keypair) = nonce_and_keypair.split_at_mut(NONCE_SIZE);
        *version = 0;
        nonce_bytes.copy_from_slice(&tx_nonce);
        keypair.copy_from_slice(self.keypair.public.as_bytes());

        let cipher_bytes_written = self
            .deoxysii
            .seal_into(&tx_nonce, pt, metadata /* AAD */, tagged_ct)
            .unwrap(); // OOM, or other irrecoverable error
        debug_assert_eq!(cipher_bytes_written + metadata_len, output_len);
        req_id
    }

    // `versioned_nonced_tagged_ct` has format: version:u8 || nonce:[u8;15] || tagged_ciphertext
    #[must_use]
    fn decrypt_into(
        &self,
        request_id: RequestId,
        versioned_nonced_tagged_ct: &mut [u8],
        pt: &mut [u8],
    ) -> bool {
        let pt_len = Self::response_pt_len(versioned_nonced_tagged_ct.len());
        if versioned_nonced_tagged_ct.len() < Self::RX_CT_OVERHEAD {
            return false;
        }

        let version = versioned_nonced_tagged_ct[0];
        if version != 0 {
            return false;
        }

        let (version_and_nonce, tagged_ct) =
            versioned_nonced_tagged_ct.split_at_mut(1 + NONCE_SIZE);
        let rx_nonce = version_and_nonce.rsplit_array_ref::<NONCE_SIZE>().1;
        if rx_nonce_to_req_id(rx_nonce) != Some(request_id) {
            return false;
        }

        match self.deoxysii.open_into(
            rx_nonce,
            tagged_ct,
            version_and_nonce, // Authenticated Associated Data (AAD)
            &mut pt[..pt_len],
        ) {
            Ok(cipher_bytes_written) => {
                debug_assert_eq!(cipher_bytes_written, pt_len);
                true
            }
            Err(_) => false,
        }
    }
}

/// Returns the request id for the provided `rx_nonce` if it's a valid rx nonce.
fn rx_nonce_to_req_id(rx_nonce: &Nonce) -> Option<RequestId> {
    // The rx (response) nonce is the 119-bit tx nonce with its MSB set.
    // This service uses only 64 bits of the tx nonce.
    let (nonce_padding, req_id_bytes) = rx_nonce.rsplit_array_ref::<REQ_ID_SIZE>();
    if nonce_padding[0] != 0x80 || nonce_padding[1..].iter().any(|b| *b != 0) {
        return None;
    }
    Some(u64::from_be_bytes(*req_id_bytes))
}

fn req_id_to_tx_nonce(req_id: RequestId) -> Nonce {
    // The tx (request) nonce is a 119 bit big-endian integer.
    // This service uses only 64 bits of the tx nonce.
    let mut tx_nonce = [0u8; NONCE_SIZE];
    tx_nonce
        .rsplit_array_mut::<REQ_ID_SIZE>()
        .1
        .copy_from_slice(&req_id.to_be_bytes());
    tx_nonce
}

#[cfg(any(test, fuzzing))]
/// [`Cipher::encrypt_into`] and [`Cipher::decrypt_into`] are not symmetric,
/// so these are included to aid proptesting.
impl SessionCipher {
    pub fn encrypt_for_decrypt(&self, pt: &[u8], request_id: u64, ct: &mut [u8]) -> RequestId {
        let mut rx_nonce = req_id_to_tx_nonce(request_id);
        rx_nonce[0] = 0x80;
        let (version_and_nonce, tagged_ct) = ct.split_at_mut(1 + NONCE_SIZE);
        let (version, nonce_bytes) = version_and_nonce.split_first_mut().unwrap();
        *version = 0;
        nonce_bytes.copy_from_slice(&rx_nonce);
        self.deoxysii
            .seal_into(&rx_nonce, pt, version_and_nonce, tagged_ct)
            .ok()
            .unwrap();
        request_id
    }

    #[must_use]
    pub fn decrypt_encrypted(&self, request_id: RequestId, ct: &mut [u8], pt: &mut [u8]) -> bool {
        let pt_len = ct.len().saturating_sub(Self::TX_CT_OVERHEAD);
        let metadata_len = 1 + NONCE_SIZE + Self::PUBLIC_KEY_SIZE;
        let (metadata, tagged_ct) = ct.split_at_mut(metadata_len);
        let version = metadata[0];
        if version != 0 {
            return false;
        }
        let mut tx_nonce = [0u8; NONCE_SIZE];
        tx_nonce.copy_from_slice(&metadata[1..(NONCE_SIZE + 1)]);
        let req_id_bytes = tx_nonce.rsplit_array_ref::<REQ_ID_SIZE>().1;
        if u64::from_be_bytes(*req_id_bytes) != request_id {
            return false;
        }
        self.deoxysii
            .open_into(&tx_nonce, tagged_ct, metadata, &mut pt[..pt_len])
            .is_ok()
    }
}

#[derive(Clone)]
struct KeyPair {
    public: x25519_dalek::PublicKey,
    secret: x25519_dalek::StaticSecret,
}

impl KeyPair {
    fn generate() -> Self {
        let mut csprng = rand::rngs::OsRng;
        let mut key_bytes = [0u8; SessionCipher::PUBLIC_KEY_SIZE];
        rand::Rng::fill(&mut csprng, &mut key_bytes);
        let secret = x25519_dalek::StaticSecret::from(key_bytes);
        let public = x25519_dalek::PublicKey::from(&secret);
        Self { public, secret }
    }
}

#[cfg(any(test, fuzzing))]
mod testing {
    use super::*;

    pub(crate) struct MockCipher;

    impl MockCipher {
        pub(crate) const TX_ENC_TAG: &'static [u8] = b"to-paratime-";
        pub(crate) const RX_ENC_TAG: &'static [u8] = b"from-paratime-";
    }

    impl Cipher for MockCipher {
        const TX_CT_OVERHEAD: usize = Self::TX_ENC_TAG.len();
        const RX_CT_OVERHEAD: usize = Self::RX_ENC_TAG.len();

        fn encrypt_into(&self, pt: &[u8], ct: &mut [u8]) -> RequestId {
            let (enc_tag, ct) = ct.split_at_mut(Self::TX_CT_OVERHEAD);
            enc_tag.copy_from_slice(Self::TX_ENC_TAG);
            ct[..pt.len()].copy_from_slice(pt);
            1 // 0 is the sentinel of the actual one
        }

        fn decrypt_into(&self, _request_id: RequestId, ct: &mut [u8], pt: &mut [u8]) -> bool {
            let ct = match ct.strip_prefix(Self::RX_ENC_TAG) {
                Some(ct) => ct,
                None => return false,
            };
            pt[..ct.len()].copy_from_slice(ct);
            true
        }
    }

    pub(crate) struct NoopCipher;

    impl Cipher for NoopCipher {
        const TX_CT_OVERHEAD: usize = 0;
        const RX_CT_OVERHEAD: usize = 0;

        fn encrypt_into(&self, pt: &[u8], ct: &mut [u8]) -> RequestId {
            ct[0..pt.len()].copy_from_slice(pt);
            0
        }

        fn decrypt_into(&self, _request_id: RequestId, ct: &mut [u8], pt: &mut [u8]) -> bool {
            pt[0..ct.len()].copy_from_slice(ct);
            true
        }
    }
}
#[cfg(any(test, fuzzing))]
pub(crate) use testing::*;

#[cfg(test)]
mod tests {
    use super::*;

    macro_rules! tx_roundtrip {
        ($pt:expr$(, $excess_capacity:literal)?) => {{
            let cipher = SessionCipher::from_runtime_public_key([0u8; 32]);
            let pt: &[u8] = $pt;
            let ct_len = SessionCipher::request_ct_len(pt.len());
            let mut ct = vec![0u8; ct_len$(+ $excess_capacity)?];
            let mut rtpt = vec![0u8; pt.len()$(+ $excess_capacity)?];
            let req_id = cipher.encrypt_into(&pt, &mut ct);
            assert!(
                pt.len() == 0 || !ct.windows(pt.len()).any(|w| w == pt),
                "pt: {pt:?} | ct: {ct:?}"
            );
            assert!(cipher.decrypt_encrypted(req_id, &mut ct[..ct_len], &mut rtpt));
            assert_eq!(pt, &rtpt[..pt.len()]);
        }};
    }

    macro_rules! rx_roundtrip {
        ($pt:expr$(, $excess_capacity:literal)?) => {{
            let cipher = SessionCipher::from_runtime_public_key([0u8; 32]);
            let pt: &[u8] = $pt;
            let ct_len = pt.len() + SessionCipher::RX_CT_OVERHEAD;
            let mut ct = vec![0u8; ct_len$(+ $excess_capacity)?];
            let mut rtpt = vec![0u8; pt.len()$(+ $excess_capacity)?];
            let req_id = cipher.encrypt_for_decrypt(pt, 0, &mut ct);
            assert!(cipher.decrypt_into(req_id, &mut ct[..ct_len], &mut rtpt));
            assert_eq!(pt, &rtpt[..pt.len()]);
        }};
    }

    #[test]
    fn session_cipher_tx_roundtrip_empty() {
        tx_roundtrip!(&[]);
        tx_roundtrip!(&[], 10);
    }

    #[test]
    fn session_cipher_tx_roundtrip_nonempty() {
        let data = b"tx_roundtrip_nonempty".as_slice();
        tx_roundtrip!(data);
        tx_roundtrip!(data, 10);
    }

    #[test]
    fn session_cipher_rx_roundtrip_empty() {
        rx_roundtrip!(&[]);
        rx_roundtrip!(&[], 10);
    }

    #[test]
    fn session_cipher_rx_roundtrip_nonempty() {
        let data = b"rx_roundtrip_nonempty".as_slice();
        rx_roundtrip!(data);
        rx_roundtrip!(data, 10);
    }

    #[test]
    fn session_cipher_rx_fallible_bad_auth() {
        let cipher = SessionCipher::from_runtime_public_key([0u8; 32]);
        let mut ct = vec![0u8; SessionCipher::RX_CT_OVERHEAD];
        let req_id = cipher.encrypt_for_decrypt(&[], 0, &mut ct);
        assert!(cipher.decrypt_into(req_id, &mut ct, &mut []));
        ct[1] ^= 1; // Send the wrong tag.
        assert!(!cipher.decrypt_into(req_id, &mut ct, &mut []));
    }

    #[test]
    fn session_cipher_rx_fallible_wrong_req_id() {
        let cipher = SessionCipher::from_runtime_public_key([0u8; 32]);
        let mut ct = vec![0u8; SessionCipher::RX_CT_OVERHEAD];
        let req_id = cipher.encrypt_for_decrypt(&[], 0, &mut ct);
        assert!(cipher.decrypt_into(req_id, &mut ct, &mut []));
        assert!(!cipher.decrypt_into(req_id + 1, &mut ct, &mut []));
    }
}
