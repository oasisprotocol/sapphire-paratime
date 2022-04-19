mod errors;
mod proxy;

use super::*;

use bumpalo::Bump;
use jsonrpsee_types::error::ErrorCode;
use serde_json::json;
use tiny_http::{Method, TestRequest};

use super::upstream::MockUpstream;
use crate::cipher::MockCipher;

const MAX_REQUEST_SIZE_BYTES: usize = 1024;

type HandlerResult<'a> = super::HandlerResult<'a, &'a Bump>;

struct TestServer {
    handler: RequestHandler<MockCipher, MockUpstream>,
    alloc: Bump,
}

impl TestServer {
    fn new() -> Self {
        Self::with_upstream(MockUpstream::new())
    }

    fn with_upstream(upstream: MockUpstream) -> Self {
        Self {
            handler: RequestHandler::new(MockCipher, upstream, MAX_REQUEST_SIZE_BYTES),
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
