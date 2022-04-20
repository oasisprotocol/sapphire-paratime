#![deny(rust_2018_idioms, single_use_lifetimes)]
#![cfg_attr(
    not(any(test, fuzzing)),
    deny(clippy::expect_used, clippy::unwrap_used)
)]
#![feature(allocator_api)]
#![cfg_attr(target_env = "sgx", feature(once_cell))]

#[cfg(target_env = "sgx")]
mod attestation;
pub mod cipher;
mod config;
mod server;

pub use crate::{config::Config, server::Server};

#[cfg(fuzzing)]
/// A module that allows fuzzing all of the things that really shouldn't be exported.
pub mod fuzz {
    pub fn handle_request(req_body: &'static str, res_body: &'static str) {
        crate::server::RequestHandler::fuzz(req_body, res_body);
    }
}
