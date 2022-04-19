mod error;
#[cfg(test)]
mod tests;
mod types;
pub(crate) mod upstream;

use std::{alloc::Allocator, io::Read};

use jsonrpsee_types as jrpc;
use serde_json::value::RawValue;

use crate::cipher::Cipher;

use upstream::Upstream;

use error::Error;
use types::*;

pub(crate) struct RequestHandler<C: Cipher, U: Upstream> {
    cipher: C,
    upstream: U,
    max_request_size_bytes: usize,
}

impl<C: Cipher, U: Upstream> RequestHandler<C, U> {
    pub(crate) fn new(cipher: C, upstream: U, max_request_size_bytes: usize) -> Self {
        Self {
            cipher,
            upstream,
            max_request_size_bytes,
        }
    }

    pub(crate) fn handle_req<'a, A: Allocator + Copy>(
        &self,
        req: &'a mut tiny_http::Request, // Will have its body consumed into `req_buf` after validation.
        req_buf: &'a mut Vec<u8, A>, // Holds the deserialized request body. Early-returned errors borrow their id and method from here.
        proxy_res_buf: &'a mut Vec<u8, A>, // Holds the proxy response body. The response borrows its data, id, and method from here.
        bump: A,
    ) -> HandlerResult<'a, A> {
        macro_rules! jrpc_err {
            ($code:ident) => {
                jrpc_err!($code, jrpc::error::ErrorCode::$code.message())
            };
            ($code:ident, $message:expr) => {
                jrpc::ErrorResponse::new(
                    jrpc::error::ErrorObject {
                        code: jrpc::error::ErrorCode::$code,
                        message: $message.into(),
                        data: None,
                    },
                    jrpc::Id::Null,
                )
            };
        }

        let content_length = match req.body_length() {
            Some(content_length) if content_length <= self.max_request_size_bytes => content_length,
            Some(_) => return Err(jrpc_err!(OversizedRequest)),
            None => {
                return Err(jrpc_err!(InternalError, "missing content-length header"));
            }
        };
        req_buf.reserve_exact(content_length);

        if std::io::copy(&mut req.as_reader().take(content_length as u64), req_buf).is_err() {
            return Err(jrpc_err!(ParseError));
        }

        let web3_req: jrpc::Request<'a> = serde_json::from_slice(req_buf)
            .map_err(|e| jrpc_err!(ParseError, format!("parse error: {e}")))?;
        let req_id = web3_req.id.clone();

        match &*web3_req.method {
            "eth_sendRawTransaction" | "eth_call" | "eth_estimateGas" => self.handle_c10l_web3_req(
                IncomingWeb3Request {
                    inner: web3_req,
                    content_length,
                },
                proxy_res_buf,
                bump,
            ),
            "eth_sendTransaction" => {
                return Err(jrpc::ErrorResponse::new(
                    jrpc::error::ErrorObject::new(jrpc::error::ErrorCode::MethodNotFound, None),
                    web3_req.id,
                ))
            }
            _ => self
                .proxy::<&'a RawValue, _>(req_buf, proxy_res_buf)
                .map(|res| jrpc::Response::new(Web3ResponseParams::RawValue(res.result), res.id)),
        }
        .map_err(move |e| e.into_rpc_error(req_id.into_owned()))
    }

    fn handle_c10l_web3_req<'a, A: Allocator + Copy>(
        &self,
        req: IncomingWeb3Request<'a>,
        proxy_res_buf: &'a mut Vec<u8, A>,
        bump: A,
    ) -> Result<jrpc::Response<'a, Web3ResponseParams<'a, A>>, Error> {
        let IncomingWeb3Request {
            inner: req,
            content_length: req_content_length,
        } = req;

        macro_rules! encrypt {
            ($data_hex:expr => $ct_hex:ident) => {{
                let data_hex = $data_hex.strip_prefix("0x").unwrap_or($data_hex);

                let data_len = data_hex.len() / 2;
                let ct_len = C::ct_len(data_len);
                let ct_hex_len = 2 * ct_len + 2;

                $ct_hex = Vec::with_capacity_in(ct_hex_len, bump);
                unsafe { $ct_hex.set_len($ct_hex.capacity()) };
                let data = &mut $ct_hex[..data_len]; // plaintext is unused after encryption

                // Allocate this in reverse drop order so that its space can be reused after drop.
                // (`bumpalo::Bump` allows re-using the last allocation).
                let mut ct_bytes = Vec::with_capacity_in(ct_len, bump);
                unsafe { ct_bytes.set_len(ct_bytes.capacity()) };

                hex::decode_to_slice(data_hex, data).map_err(Error::InvalidRequestData)?;
                self.cipher.encrypt_into(&data, &mut ct_bytes);

                $ct_hex[0..2].copy_from_slice(b"0x");
                #[allow(clippy::unwrap_used)]
                hex::encode_to_slice(&ct_bytes[..ct_len], &mut $ct_hex[2..]).unwrap(); // infallible
            }};
        }

        let pt_data_len: usize;
        let enc_data_hex_len;
        let mut enc_data_hex: Vec<u8, A>;

        let params_str = req.params.map(|rv| rv.get()).ok_or(Error::MissingParams)?;
        let req_params: Web3RequestParams<'_> = match &*req.method {
            "eth_sendRawTransaction" => {
                let params: EthSendRawTxParams<'a> =
                    serde_json::from_str(params_str).map_err(Error::InvalidParams)?;
                pt_data_len = params.0.len();
                encrypt!(params.0 => enc_data_hex);
                enc_data_hex_len = enc_data_hex.len();
                Web3RequestParams::SendRawTx((from_utf8(&enc_data_hex),))
            }
            "eth_call" | "eth_estimateGas" => {
                let params: EthCallParams<'a> =
                    serde_json::from_str(params_str).map_err(Error::InvalidParams)?;
                match params.0.data.as_ref() {
                    Some(data) => {
                        pt_data_len = data.len();
                        encrypt!(data => enc_data_hex);
                        enc_data_hex_len = enc_data_hex.len()
                    }
                    None => {
                        pt_data_len = 0;
                        enc_data_hex = Vec::new_in(bump); // doesn't allocate
                        enc_data_hex_len = 0;
                    }
                }
                Web3RequestParams::Call((
                    EthTx {
                        data: Some(from_utf8(&enc_data_hex)),
                        ..params.0
                    },
                    params.1,
                ))
            }
            _ => unreachable!("not a confidential method"),
        };

        let expected_req_content_length = enc_data_hex_len - pt_data_len + req_content_length;
        let mut req_bytes = Vec::with_capacity_in(
            expected_req_content_length + 50, // add a few bytes for serde quirks, if any.
            bump,
        );
        let initial_capacity = req_bytes.capacity();
        #[allow(clippy::unwrap_used)]
        serde_json::to_writer(
            &mut req_bytes,
            &Web3Request {
                jsonrpc: jrpc::TwoPointZero,
                id: &req.id,
                method: &req.method,
                params: req_params,
            },
        )
        .unwrap(); // infallible, assuming correct allocation
        debug_assert_eq!(req_bytes.capacity(), initial_capacity);

        match &*req.method {
            // The responses of these two are not confidential.
            "eth_sendRawTransaction" | "eth_estimateGas" => self
                .proxy::<&'a RawValue, _>(&req_bytes, proxy_res_buf)
                .map(|res| jrpc::Response::new(Web3ResponseParams::RawValue(res.result), res.id)),
            "eth_call" => {
                let call_res = self.proxy::<&'a str, _>(&req_bytes, proxy_res_buf)?;

                let enc_res_hex = call_res
                    .result
                    .strip_prefix("0x")
                    .unwrap_or(call_res.result);

                let enc_res_len = enc_res_hex.len() / 2;
                let res_len = C::pt_len(enc_res_len);
                let res_hex_len = 2 * res_len + 2 /* 0x */;

                let mut enc_res_bytes = Vec::with_capacity_in(enc_res_len, bump); // will also hold res hex after decryption
                unsafe { enc_res_bytes.set_len(enc_res_bytes.capacity()) };
                hex::decode_to_slice(enc_res_hex, &mut enc_res_bytes)
                    .map_err(Error::InvalidResponseData)?;

                let mut res_bytes = Vec::with_capacity_in(res_len, bump);
                unsafe { res_bytes.set_len(res_bytes.capacity()) };
                if self
                    .cipher
                    .decrypt_into(&mut enc_res_bytes, &mut res_bytes)
                    .is_none()
                {
                    tracing::error!("failed to decrypt response");
                    return Err(Error::Internal);
                }

                let mut res_hex = enc_res_bytes;
                res_hex.truncate(res_hex_len);
                debug_assert_eq!(res_hex.len(), res_hex_len);
                res_hex[0..2].copy_from_slice(b"0x");
                #[allow(clippy::unwrap_used)]
                hex::encode_to_slice(res_bytes, &mut res_hex[2..]).unwrap(); // infallible

                Ok(jrpc::Response::new(
                    Web3ResponseParams::CallResult(res_hex),
                    call_res.id,
                ))
            }
            _ => unreachable!("not a confidential method"),
        }
    }

    fn proxy<'a, T: serde::de::Deserialize<'a>, A: Allocator + Copy>(
        &self,
        req_body: &[u8],
        res_buf: &'a mut Vec<u8, A>, // jrpc::Response borrows from here (the response body).
    ) -> Result<jrpc::Response<'a, T>, Error> {
        let res = self.upstream.request(req_body)?;
        if res.status() == 429 {
            return Err(Error::RateLimited);
        } else if res.status() != 200 {
            return Err(Error::ErrorResponse(res.status()));
        }

        let res_content_length = res
            .header("content-length")
            .and_then(|l| l.parse::<usize>().ok());
        let mut res_reader = match res_content_length {
            Some(content_length) => {
                res_buf.reserve_exact((content_length as usize).saturating_sub(res_buf.capacity()));
                res.into_reader()
                    .take(content_length.min(self.max_request_size_bytes) as u64)
            }
            None => res.into_reader().take(self.max_request_size_bytes as u64),
        };
        std::io::copy(&mut res_reader, res_buf).map_err(|_| Error::Internal)?;
        serde_json::from_slice(res_buf).map_err(Error::UnexpectedRepsonse)
    }
}

#[cfg(fuzzing)]
impl RequestHandler<crate::cipher::NoopCipher, upstream::MockUpstream> {
    pub(crate) fn fuzz(req_body: &'static str, res_body: &'static str) {
        let mut upstream = upstream::MockUpstream::new();
        upstream
            .expect_request()
            .returning(|_| Ok(ureq::Response::new(200, "OK", res_body).unwrap()));
        let handler = RequestHandler::new(crate::cipher::NoopCipher, upstream, 1024 * 1024);

        let mut req = tiny_http::TestRequest::new().with_body(req_body).into();
        let bump = bumpalo::Bump::new();
        let mut req_buf = Vec::new_in(&bump);
        let mut proxy_res_buf = Vec::new_in(&bump);
        handler
            .handle_req(&mut req, &mut req_buf, &mut proxy_res_buf, &bump)
            .ok();
    }
}
