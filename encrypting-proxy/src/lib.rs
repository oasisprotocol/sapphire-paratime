#![deny(rust_2018_idioms, single_use_lifetimes, unreachable_pub)]
#![cfg_attr(not(test), deny(clippy::expect_used, clippy::unwrap_used))]
#![feature(allocator_api)]

mod cipher;
mod config;
mod server;

pub use crate::{config::Config, server::Server};

#[cfg(fuzzing)]
pub fn handle_request(req_body: &str, res_body: &str) {
    use crate::{
        cipher::NoopCipher,
        server::{MockUpstream, RequestHandler},
    };

    fn make_static(s: &str) -> &'static str {
        unsafe { std::mem::transmute::<_, &'static str>(s) }
    }

    let res_body = make_static(res_body);
    let mut upstream = MockUpstream::new();
    upstream
        .expect_request()
        .returning(|_| Ok(ureq::Response::new(200, "OK", res_body).unwrap()));
    let handler = RequestHandler::new(NoopCipher, upstream, 1024 * 1024);

    let mut req = tiny_http::TestRequest::new()
        .with_body(make_static(req_body))
        .into();
    let bump = bumpalo::Bump::new();
    let mut req_buf = Vec::new_in(&bump);
    let mut proxy_res_buf = Vec::new_in(&bump);
    handler
        .handle_req(&mut req, &mut req_buf, &mut proxy_res_buf, &bump)
        .ok();
}
