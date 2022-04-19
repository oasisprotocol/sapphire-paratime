mod errors;

use super::*;

use bumpalo::Bump;
use jsonrpsee_types::{self as jrpc, error::ErrorCode};
use serde_json::json;
use tiny_http::{Method, TestRequest};

use crate::cipher::MockCipher;

const MAX_REQUEST_SIZE_BYTES: usize = 1024;

type HandlerResult<'a> = super::HandlerResult<'a, &'a Bump>;

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
