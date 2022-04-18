use std::sync::atomic::{AtomicU64, Ordering::SeqCst};

use deoxysii::{DeoxysII, NONCE_SIZE, TAG_SIZE};
use hmac::Mac;

type Kdf = hmac::Hmac<sha2::Sha512_256>;
type Nonce = [u8; deoxysii::NONCE_SIZE];

const PUBLIC_KEY_SIZE: usize = 32;
/// The size of the additional items sent to the runtime.
const ENC_OVERHEAD: usize = 2 * NONCE_SIZE + TAG_SIZE + PUBLIC_KEY_SIZE + 1 /* version byte */;
/// The size of the additional items returned from the runtime.
const DEC_OVERHEAD: usize = NONCE_SIZE + TAG_SIZE + 1 /* version byte */;

pub(crate) struct SessionCipher {
    keypair: KeyPair,
    deoxysii: DeoxysII,
    nonce: AtomicU64,
}

impl SessionCipher {
    pub(crate) fn from_runtime_public_key(runtime_public_key: [u8; PUBLIC_KEY_SIZE]) -> Self {
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

    /// Encrypts `pt` into `versioned_nonced_tagged_ct`. The latter must be at least as large as
    /// `ct_len(pt)` or else this function will panic.
    /// Returns the number of bytes written.
    // `enveloped_tagged_ct` has format: version:u8 || rx_pub_key:[u8;32] || rx_nonce[u8;15]
    pub(crate) fn encrypt_into(&self, pt: &[u8], enveloped_tagged_ct: &mut [u8]) -> usize {
        let (tx_nonce, rx_nonce) = self.next_nonce();

        let metadata_size = 1 + PUBLIC_KEY_SIZE + NONCE_SIZE;
        let (metadata, tagged_ct) = enveloped_tagged_ct.split_at_mut(metadata_size);
        metadata[0] = 0; // version
        metadata[1..(PUBLIC_KEY_SIZE + 1)].copy_from_slice(self.keypair.public.as_bytes());
        metadata[(PUBLIC_KEY_SIZE + 1)..].copy_from_slice(&rx_nonce);

        #[allow(clippy::unwrap_used)]
        let bytes_written = self
            .deoxysii
            .seal_into(&tx_nonce, pt, metadata, tagged_ct)
            .unwrap(); // OOM?
        debug_assert_eq!(bytes_written, Self::ct_len(pt));
        bytes_written
    }

    pub(crate) fn ct_len(pt: &[u8]) -> usize {
        pt.len() + ENC_OVERHEAD
    }

    /// Decrypts `versioned_nonced_tagged_ct` into `pt`. The latter must be at least as large as
    /// to `pt_len(versioned_nonced_tagged_ct)` or else this function will panic.
    /// successful decryption.
    /// Returns the number of bytes written if successful.
    #[must_use]
    pub(crate) fn decrypt_into<A: std::alloc::Allocator>(
        &self,
        mut versioned_nonced_tagged_ct: Vec<u8, A>,
        pt: &mut [u8],
    ) -> Option<usize> {
        if versioned_nonced_tagged_ct.len() < DEC_OVERHEAD {
            return None;
        }
        let expected_pt_len = Self::pt_len(&versioned_nonced_tagged_ct);

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

    pub(crate) fn pt_len(versioned_nonced_tagged_ct: &[u8]) -> usize {
        versioned_nonced_tagged_ct
            .len()
            .saturating_sub(DEC_OVERHEAD)
    }

    /// Derives a MRAE AEAD symmetric key suitable for use with the asymmetric
    /// box primitives from the provided X25519 public and private keys.
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

#[derive(Clone)]
struct KeyPair {
    public: x25519_dalek::PublicKey,
    secret: x25519_dalek::StaticSecret,
}

impl KeyPair {
    fn generate() -> Self {
        let mut csprng = rand::rngs::OsRng;
        let mut key_bytes = [0u8; PUBLIC_KEY_SIZE];
        rand::Rng::fill(&mut csprng, &mut key_bytes);
        let secret = x25519_dalek::StaticSecret::from(key_bytes);
        let public = x25519_dalek::PublicKey::from(&secret);
        Self { public, secret }
    }
}
