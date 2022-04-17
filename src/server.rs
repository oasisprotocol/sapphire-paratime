use std::{alloc::Allocator, io::Read, sync::Arc};

use bumpalo::Bump;
use jsonrpsee_types as jrpc;
use thiserror::Error;
use tiny_http::StatusCode;

use crate::cipher::SessionCipher;

const MAX_REQUEST_SIZE_BYTES: usize = 1024 * 1024; // 1 MiB

pub(crate) struct Server {
    server: tiny_http::Server,
    config: crate::config::Config,
    http_agent: ureq::Agent,
    cipher: SessionCipher,
}

impl Server {
    pub(crate) fn new(
        config: crate::config::Config,
    ) -> Result<Arc<Self>, std::boxed::Box<dyn std::error::Error + Send + Sync + 'static>> {
        let server_cfg = tiny_http::ServerConfig {
            addr: &config.listen_addr,
            ssl: None, // TODO: fetch from letsencrypt or other provider
        };
        Ok(Arc::new(Self {
            server: tiny_http::Server::new(server_cfg)?,
            config,
            http_agent: ureq::AgentBuilder::new()
                .timeout(std::time::Duration::from_secs(30))
                .build(),
            cipher: SessionCipher::from_runtime_public_key([0u8; 32]), // TODO: fetch runtime public key
        }))
    }

    pub(crate) fn serve(&self) -> ! {
        loop {
            let mut req = match self.server.recv() {
                Ok(req) => req,
                Err(_) => continue,
            };
            macro_rules! with_headers {
                ($res:expr, { $($name:literal: $value:literal),+ $(,)? }) => {
                    $res$(
                    .with_header(
                        tiny_http::Header::from_bytes($name.as_bytes(), $value.as_bytes()).unwrap()
                    )
                    )+
                }
            }

            let res = with_headers!(tiny_http::Response::new_empty(StatusCode(200)), {
                "access-control-allow-origin": "*",
                "access-control-allow-methods": "POST,OPTIONS",
                "access-control-allow-headers": "content-type",
                "access-control-max-age": "86400",
            });

            if self.config.tls && !req.secure() {
                req.respond(res.with_status_code(StatusCode(421))).ok();
                continue;
            }

            match &req.method() {
                tiny_http::Method::Options => {
                    req.respond(res.with_status_code(StatusCode(204))).ok();
                    continue;
                }
                tiny_http::Method::Post => {}
                _ => {
                    req.respond(res.with_status_code(StatusCode(405))).ok();
                    continue;
                }
            }

            let res = with_headers!(res, { "content-type": "application/json" });

            thread_local!(static BUMP: std::cell::RefCell<Bump> = Default::default());
            BUMP.with(|bump_cell| {
                let mut bump = bump_cell.borrow_mut();
                {
                    let mut proxy_res_buf = Vec::new_in(&*bump);
                    let mut req_buf = Vec::new_in(&*bump);
                    let mut res_buf = Vec::new_in(&*bump);
                    #[allow(clippy::unwrap_used)]
                    match self
                        .handle_req(&mut req, &mut req_buf, &mut proxy_res_buf, &*bump)
                        .as_ref()
                    {
                        Ok(res_data) => serde_json::to_writer(&mut *res_buf, res_data),
                        Err(res_data) => serde_json::to_writer(&mut *res_buf, res_data),
                    }
                    .unwrap(); // OOM or something bad
                    let res = res.with_data(res_buf.as_slice(), Some(res_buf.len()));
                    if let Err(e) = req.respond(res) {
                        tracing::error!(error=%e, "error responding to request");
                    }
                }
                bump.reset();
            });
        }
    }

    fn handle_req<'a, A: Allocator>(
        &self,
        req: &'a mut tiny_http::Request, // Will have its body consumed into `req_buf` after validation.
        req_buf: &'a mut Vec<u8, A>, // Holds the deserialized request body. Early-returned errors borrow their id and method from here.
        proxy_res_buf: &'a mut Vec<u8, A>, // Holds the proxy response body. The response borrows its data, id, and method from here.
        bump: &'a Bump,
    ) -> Result<jrpc::Response<'a, Web3ResponseParams<'a>>, jrpc::ErrorResponse<'a>> {
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
            Some(content_length) if content_length <= MAX_REQUEST_SIZE_BYTES => content_length,
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
            "eth_sendRawTransaction" | "eth_call" | "eth_estimateGas" => {
                self.handle_c10l_web3_req(web3_req, proxy_res_buf, bump)
            }
            "eth_sendTransaction" => {
                return Err(jrpc::ErrorResponse::new(
                    jrpc::error::ErrorObject::new(jrpc::error::ErrorCode::MethodNotFound, None),
                    web3_req.id,
                ))
            }
            _ => self
                .proxy::<&'a serde_json::value::RawValue, _>(req_buf, proxy_res_buf)
                .map(|res| jrpc::Response::new(Web3ResponseParams::RawValue(res.result), res.id)),
        }
        .map_err(move |e| e.into_rpc_error(req_id.into_owned()))
    }

    fn handle_c10l_web3_req<'a, A: Allocator>(
        &self,
        req: jrpc::Request<'a>,
        proxy_res_buf: &'a mut Vec<u8, A>,
        bump: &'a Bump,
    ) -> Result<jrpc::Response<'a, Web3ResponseParams<'a>>, ProxyError> {
        // TODO: wait for https://github.com/fitzgen/bumpalo/issues/63
        let mut params: smallvec::SmallVec<[serde_json::Value; 2]> =
            serde_json::from_str(req.params.map(|rv| rv.get()).unwrap_or_default())
                .map_err(ProxyError::InvalidParams)?;

        let data_value: Option<&mut serde_json::Value> = match &*req.method {
            "eth_sendRawTransaction" => params.get_mut(0),
            "eth_call" | "eth_estimateGas" => params
                .get_mut(0)
                .and_then(|p0| p0.as_object_mut())
                .and_then(|tx| tx.get_mut("data")),
            _ => unreachable!("not a confidential method"),
        };

        if let Some(data_value) = data_value {
            let data_hex = data_value.as_str().unwrap_or_default();
            let data_hex = data_hex.strip_prefix("0x").unwrap_or(data_hex);
            let mut data = Vec::with_capacity_in(data_hex.len() / 2, bump);
            hex::decode_to_slice(data_hex, &mut data).map_err(ProxyError::InvalidRequestData)?;
            *data_value = hex::encode(self.cipher.encrypt(&data)).into();
        }

        let req_ser = jrpc::RequestSer::new(
            &req.id,
            &req.method,
            Some(jrpc::ParamsSer::ArrayRef(&params)),
        );

        let mut req_bytes = Vec::new_in(bump);
        #[allow(clippy::unwrap_used)]
        serde_json::to_writer(&mut req_bytes, &req_ser).unwrap();

        match &*req.method {
            // The responses of these two are not confidential.
            "eth_sendRawTransaction" | "eth_estimateGas" => self
                .proxy::<&'a serde_json::value::RawValue, _>(&req_bytes, proxy_res_buf)
                .map(|res| jrpc::Response::new(Web3ResponseParams::RawValue(res.result), res.id)),
            "eth_call" => {
                let call_res = self.proxy::<&'a str, _>(&req_bytes, proxy_res_buf)?;
                let enc_res_hex = call_res
                    .result
                    .strip_prefix("0x")
                    .unwrap_or(call_res.result);
                let mut enc_res_bytes = Vec::new_in(bump);
                hex::decode_to_slice(enc_res_hex, &mut enc_res_bytes)
                    .map_err(ProxyError::InvalidResponseData)?;
                let res_data = self.cipher.decrypt(&mut enc_res_bytes).unwrap_or_default();
                let mut res_hex = Vec::with_capacity_in(res_data.len() * 2 + 2, bump);
                res_hex.resize(res_hex.capacity(), 0);
                res_hex[0..2].copy_from_slice(b"0x");
                #[allow(clippy::unwrap_used)]
                hex::encode_to_slice(res_data, &mut res_hex[2..]).unwrap(); // OOM or other catastrophic error
                Ok(jrpc::Response::new(
                    Web3ResponseParams::CallResult(res_hex),
                    call_res.id,
                ))
            }
            _ => unreachable!("not a confidential method"),
        }
    }

    fn proxy<'a, T: serde::de::Deserialize<'a>, A: Allocator>(
        &self,
        req_body: &[u8],
        res_buf: &'a mut Vec<u8, A>, // jrpc::Response borrows from here (the response body).
    ) -> Result<jrpc::Response<'a, T>, ProxyError> {
        let proxy_req = self.http_agent.request_url("POST", &self.config.upstream);
        let res = match proxy_req.send_bytes(req_body) {
            Ok(res) => res,
            Err(ureq::Error::Status(_, res)) => res,
            Err(ureq::Error::Transport(te)) => match te.kind() {
                ureq::ErrorKind::Io => return Err(ProxyError::Timeout),
                _ => return Err(ProxyError::BadGateway(Box::new(ureq::Error::Transport(te)))),
            },
        };
        std::io::copy(&mut res.into_reader(), res_buf).map_err(|_| ProxyError::Internal)?;
        serde_json::from_slice(res_buf).map_err(ProxyError::UnexpectedRepsonse)
    }
}

enum Web3ResponseParams<'a> {
    RawValue(&'a serde_json::value::RawValue),
    CallResult(Vec<u8, &'a Bump>), // `String::from_utf8` requires the vec be in the global allocator
}

impl serde::Serialize for Web3ResponseParams<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::RawValue(rv) => rv.serialize(serializer),
            Self::CallResult(hex_bytes) => {
                #[allow(unsafe_code)]
                let hex_str = unsafe { std::str::from_utf8_unchecked(hex_bytes) };
                hex_str.serialize(serializer)
            }
        }
    }
}

#[derive(Debug, Error)]
enum ProxyError {
    #[error("request timed out")]
    Timeout,

    #[error(transparent)]
    BadGateway(#[from] Box<ureq::Error>),

    #[error(transparent)]
    InvalidParams(serde_json::Error),

    #[error("invalid hex data in request: {0}")]
    InvalidRequestData(hex::FromHexError),

    #[error("invalid hex data in upstream response: {0}")]
    InvalidResponseData(hex::FromHexError),

    #[error("invalid response from the upstream gateway: {0}")]
    UnexpectedRepsonse(#[source] serde_json::Error),

    #[error("an unexpected error occured")]
    Internal,
}

impl ProxyError {
    fn into_rpc_error(self, req_id: jrpc::Id<'_>) -> jrpc::error::ErrorResponse<'_> {
        let code = match self {
            Self::Timeout => jrpc::error::ErrorCode::ServerIsBusy,
            Self::InvalidParams(_) | Self::InvalidRequestData(_) => {
                jrpc::error::ErrorCode::InvalidParams
            }
            Self::UnexpectedRepsonse(_) | Self::InvalidResponseData(_) => {
                jrpc::error::ErrorCode::InternalError
            }
            Self::BadGateway(_) => jrpc::error::ErrorCode::ServerError(-1),
            Self::Internal => jrpc::error::ErrorCode::ServerError(-2),
        };
        let message = format!("{}. {}", code.message(), self);
        jrpc::ErrorResponse::new(
            jrpc::error::ErrorObject {
                code,
                message: message.into(),
                data: None,
            },
            req_id,
        )
    }
}
