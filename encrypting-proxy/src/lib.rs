#![deny(rust_2018_idioms, single_use_lifetimes, unreachable_pub)]
#![cfg_attr(not(test), deny(clippy::expect_used, clippy::unwrap_used))]
#![feature(allocator_api)]

mod cipher;
mod config;
mod server;

pub use crate::{config::Config, server::Server};

#[cfg(fuzzing)]
pub mod fuzz {
    pub fn handle_request(req_body: &'static str, res_body: &'static str) {
        crate::server::RequestHandler::fuzz(req_body, res_body);
    }
}
