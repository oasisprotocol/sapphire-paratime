use std::{alloc::Allocator, io::Read, sync::Arc};

use bumpalo::Bump;
use jsonrpsee_types as jrpc;
use serde_json::value::RawValue;
use thiserror::Error;
use tiny_http::StatusCode;

use crate::cipher::SessionCipher;

const MAX_REQUEST_SIZE_BYTES: usize = 1024 * 1024; // 1 MiB

pub(crate) struct Server {
    server: tiny_http::Server,
    handler: RequestHandler,
    is_tls: bool,
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
            is_tls: config.tls,
            handler: RequestHandler {
                cipher: SessionCipher::from_runtime_public_key(config.runtime_public_key),
                http_agent: ureq::AgentBuilder::new()
                    .timeout(std::time::Duration::from_secs(30))
                    .build(),
                upstream: config.upstream,
            },
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

            if self.is_tls && !req.secure() {
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
                    let mut proxy_res_buf = Vec::new_in(&*bump); // will be resized in `fn proxy`
                    let mut req_buf = Vec::new_in(&*bump); // will be resized in `fn handle_req`
                    let mut res_buf = Vec::with_capacity_in(1024 /* rough estimate */, &*bump);
                    #[allow(clippy::unwrap_used)]
                    match self
                        .handler
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
}

struct RequestHandler {
    cipher: SessionCipher,
    http_agent: ureq::Agent,
    upstream: url::Url,
}

impl RequestHandler {
    fn handle_req<'a, A: Allocator>(
        &self,
        req: &'a mut tiny_http::Request, // Will have its body consumed into `req_buf` after validation.
        req_buf: &'a mut Vec<u8, A>, // Holds the deserialized request body. Early-returned errors borrow their id and method from here.
        proxy_res_buf: &'a mut Vec<u8, A>, // Holds the proxy response body. The response borrows its data, id, and method from here.
        bump: &'a Bump,
    ) -> HandlerResult<'a> {
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
                .proxy::<&'a RawValue, _>(req_buf, proxy_res_buf)
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
        let params_str = req
            .params
            .map(|rv| rv.get())
            .ok_or(ProxyError::MissingParams)?;

        // A replacement for [`jsonrpsee_types::RequestSer`], which requires owned params.
        #[derive(serde::Serialize)]
        struct Web3Request<'a> {
            jsonrpc: jrpc::TwoPointZero,
            id: &'a jrpc::Id<'a>,
            method: &'a str,
            params: Web3RequestParams<'a>,
        }

        #[derive(serde::Serialize)]
        #[serde(untagged)]
        enum Web3RequestParams<'a> {
            SendRawTx(#[serde(borrow)] EthSendRawTxParams<'a>),
            Call(#[serde(borrow)] EthCallParams<'a>),
        }

        type EthSendRawTxParams<'a> = (&'a str,);
        type EthCallParams<'a> = (EthTx<'a>, Option<&'a RawValue>);

        #[derive(serde::Serialize, serde::Deserialize)]
        struct EthTx<'a> {
            #[serde(borrow)]
            from: Option<&'a RawValue>,
            #[serde(borrow)]
            to: Option<&'a RawValue>,
            #[serde(borrow)]
            gas: Option<&'a RawValue>,
            #[serde(borrow)]
            gas_price: Option<&'a RawValue>,
            #[serde(borrow)]
            value: Option<&'a RawValue>,
            #[serde(borrow)]
            data: Option<&'a str>,
        }

        macro_rules! encrypt {
            ($data_hex:expr => $ct_hex:ident) => {{
                let data_hex = $data_hex.strip_prefix("0x").unwrap_or($data_hex);

                let data_len = data_hex.len() / 2;
                let ct_len = SessionCipher::ct_len(data_len);
                let ct_hex_len = 2 * ct_len + 2;

                $ct_hex = Vec::with_capacity_in(ct_hex_len, bump);
                unsafe { $ct_hex.set_len($ct_hex.capacity()) };
                let data = &mut $ct_hex[..data_len]; // plaintext is unused after encryption

                // Allocate this in reverse drop order so that its space can be reused after drop
                // ([`bumpalo::Bump`] allows re-using the last allocation).
                let mut ct_bytes = Vec::with_capacity_in(ct_len, bump);
                unsafe { ct_bytes.set_len(ct_bytes.capacity()) };

                hex::decode_to_slice(data_hex, data).map_err(ProxyError::InvalidRequestData)?;
                self.cipher.encrypt_into(&data, &mut ct_bytes);

                $ct_hex[0..2].copy_from_slice(b"0x");
                #[allow(clippy::unwrap_used)]
                hex::encode_to_slice(&ct_bytes, &mut $ct_hex[2..]).unwrap(); // infallible
            }};
        }

        let pt_data_len: usize;
        let enc_data_hex_len;
        let mut enc_data_hex: Vec<u8, &'a Bump>;

        let req_params: Web3RequestParams<'_> = match &*req.method {
            "eth_sendRawTransaction" => {
                let params: EthSendRawTxParams<'a> =
                    serde_json::from_str(params_str).map_err(ProxyError::InvalidParams)?;
                pt_data_len = params.0.len();
                encrypt!(params.0 => enc_data_hex);
                enc_data_hex_len = enc_data_hex.len();
                Web3RequestParams::SendRawTx((from_utf8(&enc_data_hex),))
            }
            "eth_call" | "eth_estimateGas" => {
                let params: EthCallParams<'a> =
                    serde_json::from_str(params_str).map_err(ProxyError::InvalidParams)?;
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

        let mut req_bytes = Vec::with_capacity_in(
            enc_data_hex_len - pt_data_len + params_str.len() + 100,
            bump,
        );
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

                let enc_res_len = enc_data_hex.len() / 2;
                let res_len = SessionCipher::pt_len(enc_res_len);
                let res_hex_len = 2 * res_len + 2;

                let mut enc_res_bytes = Vec::with_capacity_in(enc_res_len / 2, bump); // will also hold res hex after decryption
                unsafe { enc_res_bytes.set_len(enc_res_bytes.capacity()) };
                hex::decode_to_slice(enc_res_hex, &mut enc_res_bytes)
                    .map_err(ProxyError::InvalidResponseData)?;

                let mut res_bytes = Vec::with_capacity_in(res_len, bump);
                unsafe { res_bytes.set_len(res_bytes.capacity()) };
                if self
                    .cipher
                    .decrypt_into(&mut enc_res_bytes, &mut res_bytes)
                    .is_none()
                {
                    tracing::error!("failed to decrypt response");
                    return Err(ProxyError::Internal);
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

    fn proxy<'a, T: serde::de::Deserialize<'a>, A: Allocator>(
        &self,
        req_body: &[u8],
        res_buf: &'a mut Vec<u8, A>, // jrpc::Response borrows from here (the response body).
    ) -> Result<jrpc::Response<'a, T>, ProxyError> {
        let proxy_req = self.http_agent.request_url("POST", &self.upstream);
        let res = match proxy_req.send_bytes(req_body) {
            Ok(res) => res,
            Err(ureq::Error::Status(_, res)) => res,
            Err(ureq::Error::Transport(te)) => match te.kind() {
                ureq::ErrorKind::Io => return Err(ProxyError::Timeout),
                _ => return Err(ProxyError::BadGateway(Box::new(ureq::Error::Transport(te)))),
            },
        };
        res_buf.reserve_exact(
            res.header("content-length")
                .and_then(|l| l.parse::<usize>().ok())
                .unwrap_or_default(),
        );
        std::io::copy(&mut res.into_reader(), res_buf).map_err(|_| ProxyError::Internal)?;
        serde_json::from_slice(res_buf).map_err(ProxyError::UnexpectedRepsonse)
    }
}

type HandlerResult<'a> =
    Result<jrpc::Response<'a, Web3ResponseParams<'a>>, jrpc::ErrorResponse<'a>>;

#[cfg_attr(test, derive(Debug))]
enum Web3ResponseParams<'a> {
    RawValue(&'a RawValue),
    CallResult(Vec<u8, &'a Bump>), // `String::from_utf8` requires the vec be in the global allocator
}

impl serde::Serialize for Web3ResponseParams<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::RawValue(rv) => rv.serialize(serializer),
            Self::CallResult(hex_bytes) => {
                let hex_str = from_utf8(hex_bytes);
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

    #[error("request missing required params")]
    MissingParams,

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
            Self::MissingParams | Self::InvalidParams(_) | Self::InvalidRequestData(_) => {
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

fn from_utf8(bytes: &'_ [u8]) -> &'_ str {
    if cfg!(debug_assertions) {
        #[allow(clippy::expect_used)]
        std::str::from_utf8(bytes).expect("re-encoded call result was not hex")
    } else {
        unsafe { std::str::from_utf8_unchecked(bytes) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use jsonrpsee_types as jrpc;
    use serde_json::json;
    use tiny_http::{Method, TestRequest};

    struct TestServer {
        handler: RequestHandler,
        alloc: Bump,
    }

    impl Default for TestServer {
        fn default() -> Self {
            Self {
                handler: RequestHandler {
                    cipher: SessionCipher::from_runtime_public_key([0; 32]),
                    http_agent: ureq::Agent::new(),
                    upstream: "http://localhost:8545".parse().unwrap(),
                },
                alloc: Bump::new(),
            }
        }
    }

    impl TestServer {
        fn new() -> Self {
            Self::default()
        }

        fn request<T>(
            &mut self,
            req: TestRequest,
            res_handler: impl FnOnce(HandlerResult<'_>) -> T,
        ) -> T {
            let outcome = {
                let mut proxy_res_buf = Vec::new_in(&self.alloc);
                let mut req_buf = Vec::new_in(&self.alloc);
                let mut req = req.into();
                let res_result = self.handler.handle_req(
                    &mut req,
                    &mut req_buf,
                    &mut proxy_res_buf,
                    &self.alloc,
                );
                res_handler(res_result)
            };
            self.alloc.reset();
            outcome
        }
    }

    // `tiny_http` has an unfortunate `TestRequest::with_body` api.
    fn to_static_str(s: &str) -> &'static str {
        unsafe { std::mem::transmute::<_, &'static str>(s) }
    }

    #[test]
    fn test_err_req_no_content_len() {
        let mut server = TestServer::new();
        server.request(
            TestRequest::new()
                .with_method(Method::Post)
                .with_header(
                    tiny_http::Header::from_bytes("content-length".as_bytes(), "".as_bytes())
                        .unwrap(),
                )
                .with_body("jsonrpc"),
            |res| {
                assert_eq!(
                    res.unwrap_err().error.code,
                    jrpc::error::ErrorCode::InternalError
                );
            },
        );
    }

    #[test]
    fn test_err_req_malformed_jsonrpc() {
        let mut server = TestServer::new();
        server.request(
            TestRequest::new().with_method(Method::Post).with_body("{}"),
            |res| {
                assert_eq!(
                    res.unwrap_err().error.code,
                    jrpc::error::ErrorCode::ParseError
                );
            },
        );
    }

    #[test]
    fn test_err_req_oversized() {
        let mut server = TestServer::new();
        let body = vec![0u8; MAX_REQUEST_SIZE_BYTES + 1];
        server.request(
            TestRequest::new()
                .with_method(Method::Post)
                .with_body(to_static_str(from_utf8(&body))),
            |res| {
                assert_eq!(
                    res.unwrap_err().error.code,
                    jrpc::error::ErrorCode::OversizedRequest
                );
            },
        );
        server.request(
            TestRequest::new()
                .with_method(Method::Post)
                .with_header(
                    tiny_http::Header::from_bytes("content-length".as_bytes(), "1".as_bytes())
                        .unwrap(),
                )
                .with_body(to_static_str(from_utf8(&body))),
            |res| {
                assert_eq!(
                    res.unwrap_err().error.code,
                    jrpc::error::ErrorCode::ParseError
                );
            },
        );
    }

    #[test]
    fn test_err_req_invalid_params() {
        let mut server = TestServer::new();
        server.request(
            TestRequest::new()
                .with_method(Method::Post)
                .with_body(to_static_str(
                    &json!({
                        "jsonrpc": "2.0",
                        "id": "123",
                        "method": "eth_sendRawTransaction",
                        "params": "0x1234",
                    })
                    .to_string(),
                )),
            |res| {
                assert_eq!(
                    res.unwrap_err().error.code,
                    jrpc::error::ErrorCode::InvalidParams
                );
            },
        );
        server.request(
            TestRequest::new()
                .with_method(Method::Post)
                .with_body(to_static_str(
                    &json!({
                        "jsonrpc": "2.0",
                        "id": "123",
                        "method": "eth_call",
                        "params": ["{}"],
                    })
                    .to_string(),
                )),
            |res| {
                assert_eq!(
                    res.unwrap_err().error.code,
                    jrpc::error::ErrorCode::InvalidParams
                );
            },
        );
    }

    #[test]
    fn test_err_req_invalid_data() {
        let mut server = TestServer::new();
        server.request(
            TestRequest::new()
                .with_method(Method::Post)
                .with_body(to_static_str(
                    &json!({
                        "jsonrpc": "2.0",
                        "id": "123",
                        "method": "eth_sendRawTransaction",
                        "params": ["0x1"],
                    })
                    .to_string(),
                )),
            |res| {
                assert_eq!(
                    res.unwrap_err().error.code,
                    jrpc::error::ErrorCode::InvalidParams
                );
            },
        );
        server.request(
            TestRequest::new()
                .with_method(Method::Post)
                .with_body(to_static_str(
                    &json!({
                        "jsonrpc": "2.0",
                        "id": "123",
                        "method": "eth_sendRawTransaction",
                        "params": ["0xgg"],
                    })
                    .to_string(),
                )),
            |res| {
                assert_eq!(
                    res.unwrap_err().error.code,
                    jrpc::error::ErrorCode::InvalidParams
                );
            },
        );
        server.request(
            TestRequest::new()
                .with_method(Method::Post)
                .with_body(to_static_str(
                    &json!({
                        "jsonrpc": "2.0",
                        "id": "123",
                        "method": "eth_call",
                        "params": ["{\"data\": \"0x123\"}", "latest"],
                    })
                    .to_string(),
                )),
            |res| {
                assert_eq!(
                    res.unwrap_err().error.code,
                    jrpc::error::ErrorCode::InvalidParams
                );
            },
        );
    }
}
