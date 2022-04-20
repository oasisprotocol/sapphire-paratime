use std::lazy::SyncLazy as Lazy;

use sgx_isa::{Report, Targetinfo};

static TARGET_INFO: Lazy<Targetinfo> = Lazy::new(|| Targetinfo::from(Report::for_self()));

pub(crate) fn get_quote<A: std::alloc::Allocator>(
    alloc: A,
) -> Result<Vec<u8, A>, Box<dyn std::error::Error>> {
    todo!()
}
