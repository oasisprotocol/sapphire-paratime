#![no_main]
#![feature(once_cell)]

use std::lazy::SyncLazy as Lazy;

use libfuzzer_sys::arbitrary;

use sapphire_encrypting_proxy::crypto::{Cipher, SessionCipher};

#[derive(Debug, arbitrary::Arbitrary)]
struct Input {
    operation: Operation,
    buf: Vec<u8>,
    out_buf_excess: u8,
}

#[derive(Debug, arbitrary::Arbitrary)]
enum Operation {
    TxRoundtrip,
    RxRoundtrip { req_id: u64 },
    Decrypt { req_id: u64 },
}

libfuzzer_sys::fuzz_target!(|input: Input| {
    static CIPHER: Lazy<SessionCipher> =
        Lazy::new(|| SessionCipher::from_runtime_public_key([0u8; 32]));
    match input.operation {
        Operation::TxRoundtrip => {
            let mut pt = input.buf;
            let ct_len = SessionCipher::request_ct_len(pt.len());
            let mut ct = vec![0u8; ct_len + input.out_buf_excess as usize];
            let mut rtpt = vec![0u8; pt.len() + input.out_buf_excess as usize];
            let req_id = CIPHER.encrypt_into(&mut pt, &mut ct);
            assert!(ct.iter().skip(ct_len).copied().all(|b| b == 0));
            assert!(CIPHER.decrypt_encrypted(req_id, &mut ct[..ct_len], &mut rtpt));
            assert_eq!(pt, &rtpt[..pt.len()]);
        }
        Operation::RxRoundtrip { req_id } => {
            let mut pt = input.buf;
            let ct_len = pt.len() + SessionCipher::RX_CT_OVERHEAD;
            let mut ct = vec![0u8; ct_len + input.out_buf_excess as usize];
            let mut rtpt = vec![0u8; pt.len() + input.out_buf_excess as usize];
            CIPHER.encrypt_for_decrypt(&mut pt, req_id, &mut ct);
            assert!(CIPHER.decrypt_into(req_id, &mut ct[..ct_len], &mut rtpt));
            assert_eq!(pt, &rtpt[..pt.len()]);
            assert!(rtpt.iter().skip(pt.len()).copied().all(|b| b == 0));
        }
        Operation::Decrypt { req_id } => {
            let mut ct = input.buf;
            let mut pt =
                vec![0u8; SessionCipher::response_pt_len(ct.len() + input.out_buf_excess as usize)];
            let _ = CIPHER.decrypt_into(req_id, &mut ct, &mut pt);
        }
    }
});
