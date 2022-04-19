use std::sync::atomic::{AtomicU64, Ordering::SeqCst};

use deoxysii::{DeoxysII, NONCE_SIZE, TAG_SIZE};
use hmac::Mac;

type Kdf = hmac::Hmac<sha2::Sha512_256>;
type Nonce = [u8; deoxysii::NONCE_SIZE];

pub(crate) trait Cipher {
    /// The size of the additional items sent to the runtime.
    const TX_CT_OVERHEAD: usize;
    /// The size of the additional items returned from the runtime.
    const RX_CT_OVERHEAD: usize;

    fn encrypt_into(&self, pt: &[u8], ct: &mut [u8]) -> usize;

    fn ct_len(pt_len: usize) -> usize {
        pt_len + Self::TX_CT_OVERHEAD
    }

    #[must_use]
    fn decrypt_into(&self, ct: &mut [u8], pt: &mut [u8]) -> Option<usize>;

    fn pt_len(ct_len: usize) -> usize {
        ct_len.saturating_sub(Self::RX_CT_OVERHEAD)
    }
}

pub(crate) struct SessionCipher {
    keypair: KeyPair,
    deoxysii: DeoxysII,
    nonce: AtomicU64,
}

impl SessionCipher {
    const PUBLIC_KEY_SIZE: usize = 32;

    pub(crate) fn from_runtime_public_key(runtime_public_key: [u8; Self::PUBLIC_KEY_SIZE]) -> Self {
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

        #[allow(clippy::unwrap_used)]
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

    /// Encrypts `pt` into `versioned_nonced_tagged_ct`. The latter must be at least as large as
    /// `ct_len(pt)` or else this function will panic.
    /// Returns the number of bytes written.
    // `enveloped_tagged_ct` has format: version:u8 || rx_pub_key:[u8;32] || rx_nonce[u8;15]
    fn encrypt_into(&self, pt: &[u8], enveloped_tagged_ct: &mut [u8]) -> usize {
        let (tx_nonce, rx_nonce) = self.next_nonce();

        let metadata_size = 1 + Self::PUBLIC_KEY_SIZE + NONCE_SIZE;
        let (metadata, tagged_ct) = enveloped_tagged_ct.split_at_mut(metadata_size);
        metadata[0] = 0; // version
        metadata[1..(Self::PUBLIC_KEY_SIZE + 1)].copy_from_slice(self.keypair.public.as_bytes());
        metadata[(Self::PUBLIC_KEY_SIZE + 1)..].copy_from_slice(&rx_nonce);

        #[allow(clippy::unwrap_used)]
        let bytes_written = self
            .deoxysii
            .seal_into(&tx_nonce, pt, metadata, tagged_ct)
            .unwrap(); // OOM?
        debug_assert_eq!(bytes_written, Self::ct_len(pt.len()));
        bytes_written
    }

    /// Decrypts `versioned_nonced_tagged_ct` into `pt`. The latter must be at least as large as
    /// to `pt_len(versioned_nonced_tagged_ct)` or else this function will panic.
    /// successful decryption.
    /// Returns the number of bytes written if successful.
    fn decrypt_into(&self, versioned_nonced_tagged_ct: &mut [u8], pt: &mut [u8]) -> Option<usize> {
        if versioned_nonced_tagged_ct.len() < Self::RX_CT_OVERHEAD {
            return None;
        }
        let expected_pt_len = Self::pt_len(versioned_nonced_tagged_ct.len());

        let (version_and_nonce, tagged_ct) =
            versioned_nonced_tagged_ct.split_at_mut(1 + NONCE_SIZE);
        let _version = version_and_nonce[0];
        let nonce = arrayref::array_ref![version_and_nonce, 1, NONCE_SIZE];

        let bytes_written = self
            .deoxysii
            .open_into(nonce, tagged_ct, version_and_nonce /* ad */, pt)
            .ok()?;
        debug_assert_eq!(bytes_written, expected_pt_len);
        Some(bytes_written)
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
            Self::ct_len(pt.len())
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
