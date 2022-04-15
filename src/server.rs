use std::{
    cell::{RefCell, RefMut},
    io::Read,
    sync::Arc,
};

use jsonrpsee_types as jrpc;
use serde_json::value::RawValue as RawJsonValue;
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
    ) -> Result<Arc<Self>, Box<dyn std::error::Error + Send + Sync + 'static>> {
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
            cipher: SessionCipher::new([0u8; 32]), // TODO
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

            thread_local! {
                // Buffers preserved between requests to avoid allocation.
                // The req and res buffers cannot be combined as the response
                // may borrow from the request body.
                static REQ_BUFS: RefCell<(Vec<u8>, Vec<u8>)> = Default::default();
            }
            REQ_BUFS.with(|bufs| {
                let (mut req_buf, mut res_buf) =
                    RefMut::map_split(bufs.borrow_mut(), |(req_buf, res_buf)| (req_buf, res_buf));
                req_buf.clear();
                res_buf.clear();
                #[allow(clippy::unwrap_used)]
                match self.handle_req(&mut req, &mut req_buf).as_ref() {
                    Ok(res_data) => serde_json::to_writer(&mut *res_buf, res_data),
                    Err(res_data) => serde_json::to_writer(&mut *res_buf, res_data),
                }
                .unwrap(); // OOM or something bad
                let res = res.with_data(res_buf.as_slice(), Some(res_buf.len()));
                if let Err(e) = req.respond(res) {
                    tracing::error!(error=%e, "error responding to request");
                }
            });
        }
    }

    fn handle_req<'a>(
        &'a self,
        req: &'a mut tiny_http::Request,
        req_body: &'a mut Vec<u8>,
    ) -> Result<jrpc::Response<'a, Box<RawJsonValue>>, jrpc::ErrorResponse<'a>> {
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
            Some(content_length) if content_length < MAX_REQUEST_SIZE_BYTES => content_length,
            Some(_) => return Err(jrpc_err!(OversizedRequest)),
            None => {
                return Err(jrpc_err!(InternalError, "missing content-length header"));
            }
        };

        if std::io::copy(&mut req.as_reader().take(content_length as u64), req_body).is_err() {
            return Err(jrpc_err!(ParseError));
        }

        let web3_req: jrpc::Request<'_> = serde_json::from_slice(req_body)
            .map_err(|e| jrpc_err!(ParseError, format!("parse error: {e}")))?;

        match &*web3_req.method {
            "eth_sendRawTransaction" | "eth_call" | "eth_estimateGas" => {
                self.handle_c10l_web3_req(web3_req).map(|res| {
                    #[allow(clippy::unwrap_used)]
                    jrpc::Response::new(
                        RawJsonValue::from_string(serde_json::to_string(&res.result).unwrap())
                            .unwrap(),
                        res.id,
                    )
                })
            }
            "eth_sendTransaction" => {
                return Err(jrpc::ErrorResponse::new(
                    jrpc::error::ErrorObject::new(jrpc::error::ErrorCode::MethodNotFound, None),
                    web3_req.id,
                ))
            }
            _ => self
                .proxy_pass(req_body)
                .map_err(|e| e.into_rpc_error(web3_req.id)),
        }
    }

    fn handle_c10l_web3_req<'a>(
        &self,
        req: jrpc::Request<'a>,
    ) -> Result<jrpc::Response<'a, serde_json::Value>, jrpc::ErrorResponse<'a>> {
        let mut params: smallvec::SmallVec<[serde_json::Value; 2]> = serde_json::from_str(
            req.params.map(|rv| rv.get()).unwrap_or_default(),
        )
        .map_err(|e| {
            let code = jrpc::error::ErrorCode::InvalidParams;
            jrpc::ErrorResponse::new(
                jrpc::error::ErrorObject {
                    code,
                    message: format!("{} {}", code.message(), e).into(),
                    data: None,
                },
                req.id.clone(),
            )
        })?;

        let data_value = match &*req.method {
            "eth_sendRawTransaction" => params.get_mut(0),
            "eth_call" | "eth_estimateGas" => params
                .get_mut(0)
                .and_then(|p0| p0.as_object_mut())
                .and_then(|tx| tx.get_mut("data")),
            _ => unreachable!("not a confidential method"),
        };

        if let Some(data_value) = data_value {
            let data = match data_value
                .as_str()
                .and_then(|data_hex| hex::decode(data_hex).ok()) // TODO: decode_to_slice into REQ_BUF
            {
                Some(data) => data,
                None => {
                    return Err(jrpc::ErrorResponse::new(
                            jrpc::error::ErrorObject::new(jrpc::error::ErrorCode::InvalidParams, None),
                            req.id.clone()
                    ))
                }
            };
            *data_value = hex::encode(self.cipher.encrypt(&data)).into();
        }

        todo!()

        // self.proxy_pass(req.headers(), &serde_json::to_vec(&web3_req).unwrap())
    }

    fn proxy(
        &self,
        req: jrpc::RequestSer<'_>,
    ) -> Result<jrpc::Response<'_, serde_json::Value>, ProxyError> {
        todo!()
    }

    fn proxy_pass(
        &self,
        proxy_req_body: &[u8],
    ) -> Result<jrpc::Response<'_, Box<RawJsonValue>>, ProxyError> {
        todo!()
        // let res = self.proxy(headers, proxy_req_body)?;
        // let headers: Vec<tiny_http::Header> = res
        //     .headers_names()
        //     .into_iter()
        //     .filter_map(|field| {
        //         let value = res.header(&field)?;
        //         tiny_http::Header::from_bytes(field.into_bytes(), value).ok()
        //     })
        //     .collect();
        // let status_code = if (200..500).contains(&res.status()) {
        //     StatusCode(res.status())
        // } else {
        //     StatusCode(502)
        // };
        // Ok(Response::new(
        //     status_code,
        //     headers,
        //     res.into_reader(),
        //     None, // data_length
        //     None, // additional_headers
        // ))
    }

    // fn proxy(
    //     &self,
    //     headers: &[tiny_http::Header],
    //     body: &[u8],
    // ) -> Result<ureq::Response, ProxyError> {
    //     let mut proxy_req = self.http_agent.request_url("POST", &self.config.upstream);
    //     for tiny_http::Header { field, value } in headers {
    //         proxy_req = proxy_req.set(field.as_str().as_str(), value.as_str());
    //     }
    //     match proxy_req.send_bytes(body) {
    //         Ok(res) => Ok(res),
    //         Err(ureq::Error::Status(_, res)) => Ok(res),
    //         Err(ureq::Error::Transport(te)) => match te.kind() {
    //             ureq::ErrorKind::BadStatus
    //             | ureq::ErrorKind::BadHeader
    //             | ureq::ErrorKind::TooManyRedirects => {
    //                 Err(ProxyError::BadGateway(ureq::Error::Transport(te)))
    //             }
    //             ureq::ErrorKind::Io => Err(ProxyError::Timeout),
    //             _ => Err(ProxyError::Internal(ureq::Error::Transport(te))),
    //         },
    //     }
    // }
}

#[derive(Debug, Error)]
enum ProxyError {
    #[error("request timed out")]
    Timeout,

    #[error(transparent)]
    BadGateway(ureq::Error),

    #[error("invalid response from the upstream gateway: {0}")]
    UnexpectedRepsonse(#[source] serde_json::Error),

    #[error(transparent)]
    Internal(ureq::Error),
}

impl ProxyError {
    fn into_rpc_error(self, req_id: jrpc::Id<'_>) -> jrpc::error::ErrorResponse<'_> {
        let code = match self {
            Self::Timeout => jrpc::error::ErrorCode::ServerIsBusy,
            Self::BadGateway(_) => jrpc::error::ErrorCode::ServerError(-1),
            Self::UnexpectedRepsonse(_) => jrpc::error::ErrorCode::InternalError,
            Self::Internal(_) => jrpc::error::ErrorCode::ServerError(-2),
        };
        let message = format!("{} {}", code.message(), self);
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
