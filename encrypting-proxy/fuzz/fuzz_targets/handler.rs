#![no_main]
use libfuzzer_sys::fuzz_target;

fuzz_target!(|req_res: (&str, &str)| {
    sapphire_encrypting_proxy::handle_request(req_res.0, req_res.1);
});
