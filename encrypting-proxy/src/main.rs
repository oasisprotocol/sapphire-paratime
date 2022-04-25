#![deny(rust_2018_idioms, single_use_lifetimes, unreachable_pub)]
#![feature(allocator_api)]

use sapphire_encrypting_proxy as sep;

fn main() {
    init_tracing();

    let config = sep::Config::load().expect("failed to load config");
    tracing::info!(config=?config, "loaded config");
    let server = sep::Server::new(config).expect("failed to start server");

    let num_threads: usize = env!("SAPPHIRE_PROXY_NUM_THREADS").parse().unwrap();
    // The main thread will also serve requests.
    let num_extra_threads = if num_threads == 1 { 0 } else { num_threads - 1 };
    for _ in 0..num_extra_threads {
        let server = server.clone();
        std::thread::spawn(move || server.serve());
    }
    tracing::info!("started server");
    server.serve();
}

fn init_tracing() {
    let base_subscriber = tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_span_events(tracing_subscriber::fmt::format::FmtSpan::CLOSE)
        .with_target(true);
    if cfg!(not(debug_assertions)) {
        base_subscriber.json().with_ansi(false).init();
    } else {
        let subscriber = base_subscriber.without_time().pretty().with_test_writer();
        subscriber.compact().try_init().ok();
    }
}
