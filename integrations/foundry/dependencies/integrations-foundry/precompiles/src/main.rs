use std::sync::Arc;
use ethabi::{ParamType, Token};
use rand::Rng;
use hex;
use x25519_dalek; 
use hmac::{Hmac, Mac};
use sha2::Sha512_256;
use std::{env, process};
use oasis_cbor;

use oasis_runtime_sdk::{
    core::common::{
        crypto::{
            mrae::deoxysii::{DeoxysII, KEY_SIZE, NONCE_SIZE},
            signature::{Signature, PublicKey as SignaturePublicKey, PrivateKey},
            x25519,
        },
        namespace::{Namespace},
    },
    context::Context,
    core::common::crypto::mrae::deoxysii,
    // crypto::signature::context::get_chain_context_for,
    crypto::signature::{
        self,
        context::get_chain_context_for,
        SignatureType,
        MemorySigner,
    },
    keymanager, 
    module,
    modules::core::Error,
    state::CurrentState,
    types::{
        transaction::{Call, CallFormat, CallResult},
        callformat::CallEnvelopeX25519DeoxysII,
    },
};
pub use oasis_core_keymanager::{
    api::KeyManagerError,
    crypto::{kdf::Kdf, KeyPair, KeyPairId, SignedPublicKey, StateKey, KEY_PAIR_ID_SIZE},
    policy::TrustedSigners,
};
use oasis_core_runtime::common::crypto::signature::{Signer};
use oasis_core_runtime::consensus::beacon::EpochTime;
use evm::{
    executor::stack::{PrecompileFailure, PrecompileHandle, PrecompileOutput},
    ExitError, ExitRevert, ExitSucceed,
};
const WORD: usize = 32;

#[derive(oasis_cbor::Encode)]
pub struct CallDataPublicKeyQueryResponse {
    pub public_key: SignedPublicKey,
    pub epoch: u64,
}
// pub struct PrivateKey(pub ed25519_dalek::SigningKey);

// impl PrivateKey {
//     pub fn from_bytes(bytes: [u8; 32]) -> Self {
//         let signing_key = ed25519_dalek::SigningKey::from_bytes(&bytes);
//         PrivateKey(signing_key)
//     }
// }

const PUBLIC_KEY_SIGNATURE_CONTEXT: &[u8] = b"oasis-core/keymanager: pk signature";


fn decode_deoxysii_args(input: &[u8]) -> Result<([u8; KEY_SIZE], [u8; NONCE_SIZE], Vec<u8>, Vec<u8>), String> {
    let call_args = ethabi::decode(
        &[
            ParamType::FixedBytes(32), // key
            ParamType::FixedBytes(32), // nonce
            ParamType::Bytes,          // plain or ciphertext
            ParamType::Bytes,          // associated data
        ],
        input,
    ).map_err(|e| e.to_string())?;

    let ad = call_args[3].clone().into_bytes().unwrap();
    let text = call_args[2].clone().into_bytes().unwrap();
    let nonce_bytes = call_args[1].clone().into_fixed_bytes().unwrap();
    let key_bytes = call_args[0].clone().into_fixed_bytes().unwrap();

    let mut nonce = [0u8; NONCE_SIZE];
    nonce.copy_from_slice(&nonce_bytes[..NONCE_SIZE]);
    let mut key = [0u8; KEY_SIZE];
    key.copy_from_slice(&key_bytes[..KEY_SIZE]);

    Ok((key, nonce, text, ad))
}

fn handle_random_bytes(input: &[u8]) -> Result<Vec<u8>, String> {
    let call_args = ethabi::decode(
        &[ParamType::Uint(256), ParamType::Bytes],
        input,
    ).map_err(|e| e.to_string())?;

    // let pers_str = call_args[1].clone().into_bytes().unwrap();
    let num_bytes: u64 = call_args[0].clone().into_uint().unwrap().try_into().unwrap_or(u64::MAX);

    let mut rng = rand::thread_rng();
    let mut result = Vec::with_capacity(num_bytes as usize);
    for _ in 0..num_bytes {
        result.push(rng.gen());
    }

    Ok(result)
}

fn handle_x25519_derive(input: &[u8]) -> Result<Vec<u8>, String> {
    if input.len() != 2 * WORD {
        return Err("input length must be 64 bytes".into());
    }

    let mut public = [0u8; WORD];
    let mut private = [0u8; WORD];
    
    public.copy_from_slice(&input[0..WORD]);
    private.copy_from_slice(&input[WORD..]);

    let public = x25519_dalek::PublicKey::from(public);
    let private = x25519_dalek::StaticSecret::from(private);

    let mut kdf = <Hmac<Sha512_256> as Mac>::new_from_slice(b"MRAE_Box_Deoxys-II-256-128")
        .map_err(|e| e.to_string())?;
    kdf.update(private.diffie_hellman(&public).as_bytes());

    let mut derived_key = [0u8; KEY_SIZE];
    let digest = kdf.finalize();
    derived_key.copy_from_slice(&digest.into_bytes()[..KEY_SIZE]);

    Ok(derived_key.to_vec())
}

fn handle_curve25519_compute_public(input: &[u8]) -> Result<Vec<u8>, String> {
    if input.len() != WORD {
        return Err("input length must be 32 bytes".into());
    }

    let private = <&[u8; WORD]>::try_from(input).unwrap();
    let secret = x25519_dalek::StaticSecret::from(*private);
    Ok(x25519_dalek::PublicKey::from(&secret).as_bytes().to_vec())
}

fn handle_deoxysii_seal(input: &[u8]) -> Result<Vec<u8>, String> {
    let (key, nonce, text, ad) = decode_deoxysii_args(input)?;
    let deoxysii = DeoxysII::new(&key);
    Ok(deoxysii.seal(&nonce, text, ad))
}

fn handle_deoxysii_open(input: &[u8]) -> Result<Vec<u8>, String> {
    let (key, nonce, ciphertext, ad) = decode_deoxysii_args(input)?;
    let deoxysii = DeoxysII::new(&key);
    deoxysii.open(&nonce, ciphertext, ad).map_err(|_| "decryption failed".into())
}

fn handle_keypair_generate(input: &[u8]) -> Result<Vec<u8>, String> {
    let call_args = ethabi::decode(
        &[
            ParamType::Uint(256), // method
            ParamType::Bytes,     // seed
        ],
        input,
    ).map_err(|e| e.to_string())?;

    let seed = call_args[1].clone().into_bytes().unwrap();
    let method: u8 = call_args[0]
        .clone()
        .into_uint()
        .unwrap()
        .try_into()
        .map_err(|_| "method identifier out of bounds")?;

    let sig_type: SignatureType = method
        .try_into()
        .map_err(|_| "unknown signature type")?;

    let signer = MemorySigner::new_from_seed(sig_type, &seed).map_err(|e| format!("error creating signer: {}", e))?;
    
    let public = signer.public_key().as_bytes().to_vec();
    let private = signer.to_bytes();

    //let mut result = Vec::new();
    //result.extend_from_slice(&public);
    //result.extend_from_slice(&private);
    let result = ethabi::encode(&[Token::Bytes(public), Token::Bytes(private)]);

    Ok(result)
}

fn handle_sign(input: &[u8]) -> Result<Vec<u8>, String> {
    let call_args = ethabi::decode(
        &[
            ParamType::Uint(256), // signature type
            ParamType::Bytes,     // private key
            ParamType::Bytes,     // context
            ParamType::Bytes,     // message
        ],
        input,
    ).map_err(|e| e.to_string())?;

    let message = call_args[3].clone().into_bytes().unwrap();
    let context = call_args[2].clone().into_bytes().unwrap();
    let pk = call_args[1].clone().into_bytes().unwrap();
    let method: u8 = call_args[0]
        .clone()
        .into_uint()
        .unwrap()
        .try_into()
        .map_err(|_| "signature type identifier out of bounds")?;

    let sig_type: SignatureType = method
        .try_into()
        .map_err(|_| "unknown signature type")?;

    let signer = MemorySigner::from_bytes(sig_type, &pk)
        .map_err(|e| format!("error creating signer: {}", e))?;

    let result = signer.sign_by_type(sig_type, &context, &message)
        .map_err(|e| format!("error signing message: {}", e))?;

    Ok(result.into())
}



fn handle_verify(input: &[u8]) -> Result<Vec<u8>, String> {
    let mut call_args = ethabi::decode(
        &[
            ParamType::Uint(256), // signature type
            ParamType::Bytes,     // public key
            ParamType::Bytes,     // context
            ParamType::Bytes,     // message
            ParamType::Bytes,     // signature
        ],
        input,
    ).map_err(|e| e.to_string())?;

    let signature = call_args.pop().unwrap().into_bytes().unwrap();
    let message = call_args.pop().unwrap().into_bytes().unwrap();
    let ctx_or_hash = call_args.pop().unwrap().into_bytes().unwrap();
    let pk = call_args.pop().unwrap().into_bytes().unwrap();
    let method: u8 = call_args
        .pop()
        .unwrap()
        .into_uint()
        .unwrap()
        .try_into()
        .map_err(|_| "signature type identifier out of bounds".to_string())?;

    let sig_type: SignatureType = method
        .try_into()
        .map_err(|_| "unknown signature type".to_string())?;

    let signature: signature::Signature = signature.into();
    let public_key = signature::PublicKey::from_bytes(sig_type, &pk)
        .map_err(|e| format!("invalid public key: {}", e))?;

    let result = public_key.verify_by_type(sig_type, &ctx_or_hash, &message, &signature);
    Ok(ethabi::encode(&[Token::Bool(result.is_ok())]))
}

fn handle_gas_used(input: &[u8]) -> Result<Vec<u8>, String> {
    // Simply return a fixed gas cost for now since we can't 
    // actually track gas usage in the standalone binary
    let used_gas: u64 = 10;
    
    // Return the gas usage encoded as uint256
    Ok(ethabi::encode(&[Token::Uint(used_gas.into())]))
}

fn handle_pad_gas(input: &[u8]) -> Result<Vec<u8>, String> {
    // Decode the target gas amount
    let call_args = ethabi::decode(
        &[ParamType::Uint(128)],
        input,
    ).map_err(|e| e.to_string())?;

    let gas_amount: u64 = call_args[0]
        .clone()
        .into_uint()
        .unwrap()
        .try_into()
        .unwrap_or(u64::MAX);

    // For simulation purposes, assume we've used 10 gas so far
    let used_gas: u64 = 10;

    // Fail if more gas than desired padding was already used
    if gas_amount < used_gas {
        return Err("gas pad amount less than already used gas".into());
    }

    // Return empty output since pad_gas doesn't return anything
    Ok(Vec::new())
}


fn handle_subcall(input: &[u8]) -> Result<Vec<u8>, String> {

    let call_args = ethabi::decode(
        &[
            ParamType::Uint(256), // epoch
            ParamType::String,    // method
            ParamType::Bytes,     // body (CBOR)
            ParamType::FixedBytes(32), // private key
        ],
        &input,
    ).map_err(|e| e.to_string())?;
 
    let body = call_args[2].clone().into_bytes().unwrap();
    let method = String::from_utf8(call_args[1].clone().into_string().unwrap().into_bytes())
        .map_err(|_| "method is malformed".to_string())?;
    let epoch = call_args[0].clone().into_uint().unwrap().try_into().unwrap_or(u64::MAX);

    if method.starts_with("evm.") {
        return Ok(ethabi::encode(&[
            Token::Uint(1.into()),    // Error status
            Token::Bytes("core".into()) // Module name
        ]));
    }
 
    match method.as_str() {
        "core.CallDataPublicKey" => {
            if body != vec![0xf6] {  // Check for CBOR null
                return Err("invalid body format".into());
            }
            
            let sk_bytes = call_args[3].clone().into_fixed_bytes().unwrap();
            let sk = PrivateKey::from_bytes(sk_bytes.clone());
            let sk_arc = Arc::new(sk);
            
            let mut secret_bytes = [0u8; 32];
            secret_bytes.copy_from_slice(&sk_bytes[..32]);
            let x25519_secret = x25519_dalek::StaticSecret::from(secret_bytes);
            let x25519_public = x25519_dalek::PublicKey::from(&x25519_secret);
            
            let key = x25519::PublicKey::from(x25519_public);
            let checksum = [1u8; 32].to_vec();
            let runtime_id = Namespace::from(vec![1u8; 32]);
            let key_pair_id = KeyPairId::from(vec![1u8; 32]);
            let signer: Arc<dyn Signer> = sk_arc;
    
            let signed_public_key = SignedPublicKey::new(
                key,
                checksum,
                runtime_id,
                key_pair_id,
                Some(EpochTime::from(epoch)),
                &signer,
            ).map_err(|e| e.to_string())?;

            let response = CallDataPublicKeyQueryResponse {
                public_key: SignedPublicKey::from(signed_public_key),
                epoch: epoch,
            };

            let response_bytes = oasis_cbor::to_vec(response);

            Ok(ethabi::encode(&[
                Token::Uint(0.into()),    // Success status
                Token::Bytes(response_bytes),
            ]))
        },
 
        "core.CurrentEpoch" => {
            if body != vec![0xf6] {
                return Err("invalid body format".into()); 
            }
 
            Ok(ethabi::encode(&[
                Token::Uint(0.into()),
                Token::Bytes(epoch.to_be_bytes().to_vec()),
            ]))
        },
 
        _ => {
            Ok(ethabi::encode(&[
                Token::Uint(1.into()),        
                Token::Bytes("unknown".into())
            ]))
        }
    }
}

fn handle_decode(input: &[u8]) -> Result<Vec<u8>, String> {
    // Add debug prints for input data
    // println!("Raw input: {}", hex::encode(input));
    
    let call_args = ethabi::decode(
        &[
            ParamType::Bytes,     // calldata
            ParamType::FixedBytes(32),     // private key
        ],
        input,
    ).map_err(|e| e.to_string())?;
    
    let data = call_args[0].clone().into_bytes().unwrap();
    let private_key = call_args[1].clone().into_fixed_bytes().unwrap();
    
    // Debug print private key
    // println!("Private key: {}", hex::encode(&private_key));
    
    let private_key: [u8; 32] = private_key.try_into()
        .map_err(|_| "private key must be 32 bytes".to_string())?;
    let private = x25519_dalek::StaticSecret::from(private_key);
    
    // Decode CBOR data
    let call: Call = oasis_cbor::from_slice(&data)
        .map_err(|e| format!("failed to decode call: {}", e))?;

    match call.format {
        CallFormat::Plain => {
            // Return encoded success with the plain call
            Ok(ethabi::encode(&[
                Token::Uint(0.into()),    // Success status
                Token::Bytes(data),       // Original data
            ]))
        },

        CallFormat::EncryptedX25519DeoxysII => {
            // Method must be empty for encrypted format
            if !call.method.is_empty() {
                return Ok(ethabi::encode(&[
                    Token::Uint(1.into()),    // Error status
                    Token::String("non-empty method".into())
                ]));
            }

            // Decode the envelope
            let envelope: CallEnvelopeX25519DeoxysII = oasis_cbor::from_value(call.body)
                .map_err(|_| "bad call envelope")?;

            let decrypted = deoxysii::box_open(
                    &envelope.nonce,
                    envelope.data.clone(),
                    vec![],
                    &envelope.pk.0,
                    &private,
                )
                .map_err(|_| "decryption failed")?;
            
            let inner_call: Call = oasis_cbor::from_slice(&decrypted)
                .map_err(|_| "invalid inner data")?;
            let data = match inner_call.body {
                oasis_cbor::Value::ByteString(data) => data,
                _ => return Err("invalid inner data".to_string())
            };
            // Return decrypted data
            Ok(data)
        }
    }
}


fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() != 2 {
        eprintln!("Usage: {} <hex-encoded input>", args[0]);
        process::exit(1);
    }

    let input_hex = args[1].trim_start_matches("0x");
    
    let input = hex::decode(input_hex).unwrap_or_else(|e| {
        eprintln!("Failed to decode hex input: {}", e);
        process::exit(1);
    });

    let binary_name = args[0].clone();
    let result = match binary_name.split('/').last().unwrap_or(&binary_name) {
        "random_bytes" => handle_random_bytes(&input),
        "x25519_derive" => handle_x25519_derive(&input),
        "curve25519_compute_public" => handle_curve25519_compute_public(&input),
        "deoxysii_seal" => handle_deoxysii_seal(&input),
        "deoxysii_open" => handle_deoxysii_open(&input),
        "keypair_generate" => handle_keypair_generate(&input),
        "sign" => handle_sign(&input),
        "verify" => handle_verify(&input),
        "gas_used" => handle_gas_used(&input),
        "pad_gas" => handle_pad_gas(&input),
        "subcall" => handle_subcall(&input),
        "decode" => handle_decode(&input),
        _ => Err("Unknown precompile".into()),
    };

    match result {
        Ok(output) => {
            print!("{}", hex::encode(output));
            process::exit(0);
        }
        Err(e) => {
            eprintln!("Error: {}", e);
            process::exit(1);
        }
    }
}