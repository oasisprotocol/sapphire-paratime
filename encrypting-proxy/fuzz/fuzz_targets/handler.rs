#![feature(allocator_api)]
#![no_main]

fn make_static(s: &str) -> &'static str {
    // The inputs from the fuzzer outlive the function invocation, so
    // we set these to static to abide by the test req/res APIs.
    unsafe { std::mem::transmute::<_, &'static str>(s) }
}

libfuzzer_sys::fuzz_target!(|req_res: (&str, &str)| {
    sapphire_encrypting_proxy::fuzz::handle_request(make_static(req_res.0), make_static(req_res.1));
});
