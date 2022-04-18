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
            handler: RequestHandler::new(
                SessionCipher::from_runtime_public_key([0; 32]),
                "http://localhost:8545".parse().unwrap(),
            ),
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
        res_handler: impl FnOnce(super::handler::HandlerResult<'_>) -> T,
    ) -> T {
        let outcome = {
            let mut proxy_res_buf = Vec::new_in(&self.alloc);
            let mut req_buf = Vec::new_in(&self.alloc);
            let mut req = req.into();
            let res_result =
                self.handler
                    .handle_req(&mut req, &mut req_buf, &mut proxy_res_buf, &self.alloc);
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
                tiny_http::Header::from_bytes("content-length".as_bytes(), "".as_bytes()).unwrap(),
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
    let body: String = "1".repeat(super::handler::MAX_REQUEST_SIZE_BYTES + 1);
    server.request(
        TestRequest::new()
            .with_method(Method::Post)
            .with_body(to_static_str(&body)),
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
                tiny_http::Header::from_bytes("content-length".as_bytes(), "1".as_bytes()).unwrap(),
            )
            .with_body(to_static_str(&body)),
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
