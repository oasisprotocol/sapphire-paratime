use super::*;

use jsonrpsee_types::{self as jrpc, error::ErrorCode};
use serde_json::json;
use tiny_http::{Method, TestRequest};

use crate::cipher::MockCipher;

use super::handler::HandlerResult;

const MAX_REQUEST_SIZE_BYTES: usize = 1024;

struct TestServer {
    handler: RequestHandler<MockCipher>,
    alloc: Bump,
}

impl TestServer {
    fn new() -> Self {
        Self::with_interceptor(|req: ureq::Request, _next: ureq::MiddlewareNext<'_>| {
            assert_eq!(
                req.url(),
                crate::config::default_upstream().to_string(),
                "wrong upstream url: {}",
                req.url()
            );
            Ok(ureq::Response::new(501, "not implemented", "").unwrap())
        })
    }

    /// Injects a middleware that can be used to mock the upstream gateway.
    fn with_interceptor(interceptor: impl ureq::Middleware) -> Self {
        Self {
            handler: RequestHandler::builder()
                .cipher(MockCipher)
                .max_request_size_bytes(MAX_REQUEST_SIZE_BYTES)
                .http_agent(ureq::AgentBuilder::new().middleware(interceptor).build())
                .build()
                .unwrap(),
            alloc: Bump::new(),
        }
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
            let res_result =
                self.handler
                    .handle_req(&mut req, &mut req_buf, &mut proxy_res_buf, &self.alloc);
            res_handler(res_result)
        };
        self.alloc.reset();
        outcome
    }
}

fn test_req(body: impl std::fmt::Display) -> TestRequest {
    TestRequest::new()
        .with_method(Method::Post)
        // `tiny_http` has an unfortunate `TestRequest::with_body` api that requires `'static`.
        .with_body(Box::leak(body.to_string().into_boxed_str()))
}

macro_rules! rpc_json {
    ($method:literal, $params:tt) => {
        json!({
            "jsonrpc": "2.0",
            "id": "123",
            "method": $method,
            "params": $params,
        })
    }
}

fn err_checker(expected_code: ErrorCode) -> impl FnOnce(HandlerResult<'_>) {
    move |res: HandlerResult<'_>| {
        let err = res.unwrap_err().error;
        assert_eq!(err.code, expected_code, "{}", err.message);
    }
}

#[test]
fn test_err_req_no_content_len() {
    let mut server = TestServer::new();
    server.request(
        test_req("jsonrpc").with_header(
            tiny_http::Header::from_bytes("content-length".as_bytes(), "".as_bytes()).unwrap(),
        ),
        err_checker(ErrorCode::InternalError),
    );
}

#[test]
fn test_err_req_malformed_jsonrpc() {
    let mut server = TestServer::new();
    server.request(test_req("{}"), err_checker(ErrorCode::ParseError));
}

#[test]
fn test_err_req_oversized() {
    let mut server = TestServer::new();
    let body: String = "1".repeat(MAX_REQUEST_SIZE_BYTES + 1);
    server.request(test_req(&body), err_checker(ErrorCode::OversizedRequest));
    server.request(
        test_req(&body).with_header(
            tiny_http::Header::from_bytes("content-length".as_bytes(), "1".as_bytes()).unwrap(),
        ),
        err_checker(ErrorCode::ParseError),
    );
}

macro_rules! assert_invalid_params {
    ($server:ident, $method:literal, $params:tt) => {
        $server.request(
            test_req(rpc_json!($method, $params)),
            err_checker(ErrorCode::InvalidParams),
        )
    };
}

#[test]
fn test_err_req_invalid_params() {
    let mut server = TestServer::new();
    assert_invalid_params!(server, "eth_sendRawTransaction", "0x1234");
    assert_invalid_params!(server, "eth_call", ["{\"data\": \"0\"}"]);
}

#[test]
fn test_err_req_invalid_data() {
    let mut server = TestServer::new();
    assert_invalid_params!(server, "eth_sendRawTransaction", ["0x1"]);
    assert_invalid_params!(server, "eth_sendRawTransaction", ["0xgg"]);
    assert_invalid_params!(server, "eth_call", ["{\"data\": \"0x123\"}", "latest"]);
}
