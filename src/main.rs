#![deny(rust_2018_idioms)]
#![forbid(unsafe_code)]

mod config;
mod req_tester;
mod server;

#[allow(clippy::expect_used)]
fn main() {
    init_tracing();

    let config = config::Config::load().expect("failed to load config");

    let server = server::Server::new(config).expect("failed to start server");

    let num_threads: usize = env!("SAPPHIRE_PROXY_NUM_THREADS").parse().unwrap();
    let num_extra_threads = if num_threads == 1 { 0 } else { num_threads - 1 };
    for _ in 0..num_extra_threads {
        let server = server.clone();
        std::thread::spawn(move || server.listen());
    }
    server.listen();
}

fn init_tracing() {
    let base_subscriber = tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_span_events(tracing_subscriber::fmt::format::FmtSpan::ACTIVE)
        .with_target(true);
    if cfg!(not(debug_assertions)) {
        base_subscriber.json().with_ansi(false).init();
    } else {
        let subscriber = base_subscriber.without_time().pretty().with_test_writer();
        subscriber.compact().try_init().ok();
    }
}
