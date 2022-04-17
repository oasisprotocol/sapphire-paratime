use std::{
    cell::RefCell,
    sync::atomic::{AtomicU64, Ordering::SeqCst},
};

use bytes::{BufMut, Bytes, BytesMut};
use deoxysii::{DeoxysII, NONCE_SIZE, TAG_SIZE};
use hmac::Mac;

use crate::utils::prepare_buf;

type Kdf = hmac::Hmac<sha2::Sha512_256>;
type Nonce = [u8; deoxysii::NONCE_SIZE];

const PUBLIC_KEY_SIZE: usize = 32;
const ENC_OVERHEAD: usize = 2 * NONCE_SIZE + TAG_SIZE + PUBLIC_KEY_SIZE + 1 /* version byte */;
const DEC_OVERHEAD: usize = NONCE_SIZE + TAG_SIZE + 1 /* version byte */;

thread_local! {
    /// A per-thread buffer that holds ciphertext/plaintext resulting from encrypt/decrypt.
    /// The idea here is to avoid allocation because that's really slow. Using a shared buf
    /// is safe since each reference gets its own capacity, but the returned `Bytes` must be
    /// dropped before another call to encrypt/decrypt to prevent additional allocation.
    static ENC_BUF: RefCell<BytesMut> = RefCell::new(BytesMut::new());
}

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

    pub(crate) fn encrypt(&self, pt: &[u8]) -> Bytes {
        ENC_BUF.with(|buf| {
            let mut buf = buf.borrow_mut();
            let required_size = pt.len() + ENC_OVERHEAD;
            prepare_buf(&mut buf, required_size);
            let (tx_nonce, rx_nonce) = self.next_nonce();

            // These will form the additional data.
            buf.put_u8(0); // version
            buf.put_slice(self.keypair.public.as_bytes());
            buf.put_slice(&rx_nonce);
            let metadata_size = 1 + PUBLIC_KEY_SIZE + NONCE_SIZE;
            #[allow(unsafe_code)]
            unsafe {
                // Capacity is already reserved.
                buf.set_len(required_size);
            }

            let mut tagged_ct = buf.split_off(metadata_size);
            // `buf` now contains just the associated data (public key and rx nonce).

            #[allow(clippy::unwrap_used)]
            let bytes_written = self
                .deoxysii
                .seal_into(&tx_nonce, pt, &buf, &mut tagged_ct)
                .unwrap(); // OOM?
            debug_assert!(bytes_written == tagged_ct.len());

            buf.unsplit(tagged_ct);
            buf.split().freeze()
        })
    }

    pub(crate) fn decrypt(&self, versioned_nonced_tagged_ct: &mut [u8]) -> Option<Bytes> {
        if versioned_nonced_tagged_ct.len() < DEC_OVERHEAD {
            return None;
        }
        ENC_BUF.with(|buf| {
            let mut buf = buf.borrow_mut();
            let pt_size = versioned_nonced_tagged_ct.len() - DEC_OVERHEAD;
            prepare_buf(&mut buf, pt_size);
            #[allow(unsafe_code)]
            unsafe {
                buf.set_len(pt_size);
            }

            let (version_and_nonce, tagged_ct) =
                versioned_nonced_tagged_ct.split_at_mut(1 + NONCE_SIZE);
            let _version = version_and_nonce[0];
            let nonce = arrayref::array_ref![version_and_nonce, 1, NONCE_SIZE];

            let bytes_written = self
                .deoxysii
                .open_into(nonce, tagged_ct, version_and_nonce /* ad */, &mut buf)
                .ok()?;
            debug_assert!(bytes_written == buf.len());
            Some(buf.split().freeze())
        })
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
