#![deny(rust_2018_idioms, single_use_lifetimes, unreachable_pub)]
#![feature(io_error_other)]

mod ext;

fn main() -> anyhow::Result<()> {
    anyhow::ensure!(dcap_ql::is_loaded(), "DCAP Quoting Library could not be loaded");
    if let Err(e) = dcap_ql::target_info() {
        anyhow::bail!("failed to get QE target info: {e:?}");
    }

    let args: Args = clap::Parser::parse();

    init_tracing(args.log_level);

    let mut device = sgxs_loaders::isgx::Device::new()?
        .einittoken_provider(aesm_client::AesmClient::new())
        .build();

    let mut enclave_builder = enclave_runner::EnclaveBuilder::new(&args.enclave_path);
    enclave_builder.forward_panics(true);
    enclave_builder.signature(&args.sig_path)?;
    enclave_builder.usercall_extension(ext::DcapQuoteExtension);
    enclave_builder.args(args.enclave_args.iter());
    let enclave = enclave_builder
        .build(&mut device)
        .map_err(|e| anyhow::anyhow!("failed to prepare enclave: {e}"))?;
    tracing::info!("running enclave");
    enclave
        .run()
        .map_err(|e| anyhow::anyhow!("failed to run enclave: {e}"))
}

#[derive(Debug, clap::Parser)]
#[clap(trailing_var_arg = true)]
struct Args {
    #[clap(long, arg_enum, default_value = "info")]
    log_level: LogLevel,

    #[clap(long)]
    /// The path to the signature file.
    sig_path: std::path::PathBuf,

    #[clap(long)]
    /// The path to the enclave file.
    enclave_path: std::path::PathBuf,

    enclave_args: Vec<String>,
}

#[derive(Clone, Copy, Debug, clap::ArgEnum)]
enum LogLevel {
    Off,
    Error,
    Warn,
    Info,
    Debug,
    Trace,
}

fn init_tracing(log_level: LogLevel) {
    let max_level = match log_level {
        LogLevel::Off => return,
        LogLevel::Error => tracing::Level::ERROR,
        LogLevel::Warn => tracing::Level::WARN,
        LogLevel::Info => tracing::Level::INFO,
        LogLevel::Debug => tracing::Level::DEBUG,
        LogLevel::Trace => tracing::Level::TRACE,
    };
    let base_subscriber = tracing_subscriber::fmt()
        .with_max_level(max_level)
        .with_span_events(tracing_subscriber::fmt::format::FmtSpan::CLOSE)
        .with_target(true);
    if cfg!(not(debug_assertions)) {
        base_subscriber.json().with_ansi(false).init();
    } else {
        let subscriber = base_subscriber.without_time().pretty().with_test_writer();
        subscriber.compact().try_init().ok();
    }
}
