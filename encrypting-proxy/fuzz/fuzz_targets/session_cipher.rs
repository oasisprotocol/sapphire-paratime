#![no_main]
use libfuzzer_sys::fuzz_target;

fuzz_target!(|req_res: (&str, &str)| {});
