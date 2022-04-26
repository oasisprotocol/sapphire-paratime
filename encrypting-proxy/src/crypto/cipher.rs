use std::sync::atomic::{AtomicU64, Ordering::SeqCst};

use deoxysii::{DeoxysII, NONCE_SIZE, TAG_SIZE};
use hmac::Mac;

type Kdf = hmac::Hmac<sha2::Sha512_256>;
type Nonce = [u8; deoxysii::NONCE_SIZE];

pub trait Cipher {
    /// The size of the additional items sent to the runtime.
    const TX_CT_OVERHEAD: usize;
    /// The size of the additional items returned from the runtime.
    const RX_CT_OVERHEAD: usize;

    fn encrypt_into(&self, pt: &[u8], ct: &mut [u8]) -> usize;

    /// The size of the (encrypted) request message.
    fn request_ct_len(pt_len: usize) -> usize {
        pt_len
            .checked_add(Self::TX_CT_OVERHEAD)
            .expect("request is much to large")
    }

    #[must_use]
    fn decrypt_into(&self, ct: &mut [u8], pt: &mut [u8]) -> Option<usize>;

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
            nonce: AtomicU64::new(0),
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

    fn next_nonce(&self) -> (Nonce /* tx */, Nonce /* rx */) {
        let tx_nonce = self.nonce.fetch_add(2, SeqCst);
        let rx_nonce = tx_nonce + 1;
        let make_nonce = |n: u64| {
            let mut nonce_bytes = [0u8; deoxysii::NONCE_SIZE];
            nonce_bytes[..std::mem::size_of::<u64>()].copy_from_slice(&n.to_le_bytes());
            nonce_bytes
        };
        (make_nonce(tx_nonce), make_nonce(rx_nonce))
    }
}

impl Cipher for SessionCipher {
    const TX_CT_OVERHEAD: usize = 2 * NONCE_SIZE + TAG_SIZE + Self::PUBLIC_KEY_SIZE + 1 /* version byte */;
    const RX_CT_OVERHEAD: usize = NONCE_SIZE + TAG_SIZE + 1 /* version byte */;

    /// Encrypts `pt` into `enveloped_tagged_ct`. The latter must be at least as large as
    /// `request_ct_len(pt)` or else this function will panic.
    /// Returns the number of bytes written.
    // `enveloped_tagged_ct` has format:
    //    version:u8 || nonce:[u8;15] || rx_nonce:[u8;15] || rx_pub_key:[u8;32]
    fn encrypt_into(&self, pt: &[u8], enveloped_tagged_ct: &mut [u8]) -> usize {
        let output_len = Self::request_ct_len(pt.len());
        if enveloped_tagged_ct.len() < output_len {
            panic!(
                "`enveloped_tagged_ct` needed length at least {output_len} but was only {}",
                enveloped_tagged_ct.len()
            );
        }
        let (tx_nonce, rx_nonce) = self.next_nonce();

        let metadata_len = 1 + 2 * NONCE_SIZE + Self::PUBLIC_KEY_SIZE;
        let (metadata, tagged_ct) = enveloped_tagged_ct.split_at_mut(metadata_len);
        let (version, nonces_and_keypair) = metadata.split_first_mut().unwrap();
        let (nonces, keypair) = nonces_and_keypair.split_at_mut(2 * NONCE_SIZE);
        let (tx_nonce_bytes, rx_nonce_bytes) = nonces.split_at_mut(NONCE_SIZE);
        *version = 0;
        tx_nonce_bytes.copy_from_slice(&tx_nonce);
        rx_nonce_bytes.copy_from_slice(&rx_nonce);
        keypair.copy_from_slice(self.keypair.public.as_bytes());

        let cipher_bytes_written = self
            .deoxysii
            .seal_into(&tx_nonce, pt, metadata /* AAD */, tagged_ct)
            .unwrap(); // OOM, or other irrecoverable error

        debug_assert_eq!(cipher_bytes_written + metadata_len, output_len);
        output_len
    }

    /// Decrypts `versioned_nonced_tagged_ct` into `pt`. The latter must be at least as large as
    /// to `response_pt_len(versioned_nonced_tagged_ct)` or else this function will panic.
    /// successful decryption.
    /// Returns the number of bytes written if successful.
    #[must_use]
    fn decrypt_into(&self, versioned_nonced_tagged_ct: &mut [u8], pt: &mut [u8]) -> Option<usize> {
        let pt_len = Self::response_pt_len(versioned_nonced_tagged_ct.len());
        if versioned_nonced_tagged_ct.len() < pt_len {
            return None;
        }

        let version = versioned_nonced_tagged_ct[0];
        if version != 0 {
            return None;
        }

        let (version_and_nonce, tagged_ct) =
            versioned_nonced_tagged_ct.split_at_mut(1 + NONCE_SIZE);
        let nonce = arrayref::array_ref![version_and_nonce, 1, NONCE_SIZE];

        let cipher_bytes_written = self
            .deoxysii
            .open_into(
                nonce,
                tagged_ct,
                version_and_nonce, // Authenticated Associated Data (AAD)
                &mut pt[..pt_len],
            )
            .ok()?;
        debug_assert_eq!(cipher_bytes_written, pt_len);
        Some(pt_len)
    }
}

#[cfg(any(test, fuzzing))]
/// [`Cipher::encrypt_into`] and [`Cipher::decrypt_into`] are not symmetric,
/// so these are included to aid proptesting.
impl SessionCipher {
    pub fn encrypt_for_decrypt(&self, pt: &[u8], nonce: &[u8; NONCE_SIZE], ct: &mut [u8]) {
        let (version_and_nonce, tagged_ct) = ct.split_at_mut(1 + NONCE_SIZE);
        let (version, nonce_bytes) = version_and_nonce.split_first_mut().unwrap();
        *version = 0;
        nonce_bytes.copy_from_slice(nonce);

        self.deoxysii
            .seal_into(nonce, pt, version_and_nonce, tagged_ct)
            .ok()
            .unwrap();
    }

    #[must_use]
    pub fn decrypt_encrypted(&self, ct: &mut [u8], pt: &mut [u8]) -> Option<()> {
        let pt_len = ct.len().saturating_sub(Self::TX_CT_OVERHEAD);
        let metadata_len = 1 + 2 * NONCE_SIZE + Self::PUBLIC_KEY_SIZE;
        let (metadata, tagged_ct) = ct.split_at_mut(metadata_len);
        let version = metadata[0];
        if version != 0 {
            return None;
        }
        let tx_nonce_bytes = &metadata[1..(NONCE_SIZE + 1)];
        let nonce = arrayref::array_ref![tx_nonce_bytes, 0, NONCE_SIZE];

        self.deoxysii
            .open_into(nonce, tagged_ct, metadata, &mut pt[..pt_len])
            .ok()?;
        Some(())
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

        fn encrypt_into(&self, pt: &[u8], ct: &mut [u8]) -> usize {
            let (enc_tag, ct) = ct.split_at_mut(Self::TX_CT_OVERHEAD);
            enc_tag.copy_from_slice(Self::TX_ENC_TAG);
            ct[..pt.len()].copy_from_slice(pt);
            Self::request_ct_len(pt.len())
        }

        fn decrypt_into(&self, ct: &mut [u8], pt: &mut [u8]) -> Option<usize> {
            let ct = ct.strip_prefix(Self::RX_ENC_TAG)?;
            pt[..ct.len()].copy_from_slice(ct);
            Some(ct.len())
        }
    }

    pub(crate) struct NoopCipher;

    impl Cipher for NoopCipher {
        const TX_CT_OVERHEAD: usize = 0;
        const RX_CT_OVERHEAD: usize = 0;

        fn encrypt_into(&self, pt: &[u8], ct: &mut [u8]) -> usize {
            ct[0..pt.len()].copy_from_slice(pt);
            pt.len()
        }

        fn decrypt_into(&self, ct: &mut [u8], pt: &mut [u8]) -> Option<usize> {
            pt[0..ct.len()].copy_from_slice(ct);
            Some(ct.len())
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
            cipher.encrypt_into(&pt, &mut ct);
            assert!(
                pt.len() == 0 || !ct.windows(pt.len()).any(|w| w == pt),
                "pt: {pt:?} | ct: {ct:?}"
            );
            cipher.decrypt_encrypted(&mut ct[..ct_len], &mut rtpt).unwrap();
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
            cipher.encrypt_for_decrypt(&pt, &[0u8; NONCE_SIZE], &mut ct);
            cipher.decrypt_into(&mut ct[..ct_len], &mut rtpt).unwrap();
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
    fn session_cipher_rx_fallible() {
        let cipher = SessionCipher::from_runtime_public_key([0u8; 32]);
        let mut pt = vec![];
        let mut ct = vec![0u8; SessionCipher::RX_CT_OVERHEAD];
        assert!(cipher.decrypt_into(&mut ct, &mut pt).is_none());
    }
}
