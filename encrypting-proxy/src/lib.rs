#![deny(rust_2018_idioms)]
#![feature(allocator_api, split_array)]
#![cfg_attr(target_env = "sgx", feature(once_cell))]

pub mod acme;
#[cfg(target_env = "sgx")]
mod attestation;
pub mod config;
pub mod crypto;
mod server;

pub use crate::{config::Config, server::Server};

#[cfg(fuzzing)]
/// A module that allows fuzzing all of the things that really shouldn't be exported.
pub mod fuzz {
    pub fn handle_request(req_body: &'static str, res_body: &'static str) {
        crate::server::RequestHandler::fuzz(req_body, res_body);
    }
}
