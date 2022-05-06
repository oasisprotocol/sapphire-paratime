#![deny(rust_2018_idioms, single_use_lifetimes, unreachable_pub)]
#![feature(allocator_api)]

use std::path::PathBuf;

use anyhow::{Error, Result};

use sapphire_encrypting_proxy as sep;

fn main() -> Result<()> {
    let args: Args = clap::Parser::parse();

    init_tracing(args.log_level);

    match args.command {
        Command::GenCsr {
            #[cfg(not(target_env = "sgx"))]
            tls_secret_key_path,
            subject,
        } => {
            let _gen_csr_span = tracing::debug_span!("gen-csr").entered();
            #[cfg(target_env = "sgx")]
            let tls_secret_key = sep::tls::load_secret_key();
            #[cfg(not(target_env = "sgx"))]
            let tls_secret_key = &sep::tls::load_secret_key_from(&tls_secret_key_path)?;
            println!("{}", sep::tls::csr::generate(tls_secret_key, &subject)?);
            Ok(())
        }
        Command::Serve {
            listen_addr,
            web3_gateway_url,
            max_request_size_bytes,
            runtime_public_key,
            #[cfg(not(target_env = "sgx"))]
            tls_secret_key_path,
            tls_cert_path,
        } => {
            let server = sep::Server::new(sep::server::Config {
                listen_addr,
                upstream: web3_gateway_url,
                max_request_size_bytes,
                runtime_public_key,
                tls: tls_cert_path
                    .map(|p| {
                        let cert_pem = read_file(&p)?;
                        #[cfg(target_env = "sgx")]
                        sep::sgx::record_tls_cert_fingerprint(&cert_pem);
                        Ok::<_, Error>(sep::server::TlsConfig {
                            certificate: cert_pem,
                            #[cfg(not(target_env = "sgx"))]
                            secret_key: read_file(tls_secret_key_path.as_ref().unwrap())?,
                            #[cfg(target_env = "sgx")]
                            // This API is not great, but it can't be blamed for not expecting
                            // keys in uncommon formats.
                            secret_key: sep::tls::load_secret_key()
                                .to_pem(Default::default())
                                .unwrap()
                                .as_bytes()
                                .to_vec(),
                        })
                    })
                    .transpose()?,
            })
            .expect("failed to start server");
            let num_threads: usize = env!("SAPPHIRE_PROXY_NUM_THREADS").parse().unwrap();
            // The main thread will also serve requests.
            let num_extra_threads = if num_threads == 1 { 0 } else { num_threads - 1 };
            tracing::debug!("starting {num_threads} server threads");
            for _ in 0..num_extra_threads {
                let server = server.clone();
                tracing::debug!("starting aux server thread");
                std::thread::spawn(move || server.serve());
            }
            tracing::info!("starting server on main thread");
            server.serve();
        }
    }
}

fn init_tracing(log_level: LogLevel) {
    let max_level = match log_level {
        LogLevel::Off => return,
        LogLevel::Error => tracing::Level::ERROR,
        LogLevel::Warn => tracing::Level::WARN,
        LogLevel::Info => tracing::Level::INFO,
        #[cfg(any(not(target_env = "sgx"), debug_assertions))]
        LogLevel::Debug => tracing::Level::DEBUG,
        #[cfg(any(not(target_env = "sgx"), debug_assertions))]
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

#[derive(Debug, clap::Parser)]
struct Args {
    #[clap(long, arg_enum, default_value = "info")]
    log_level: LogLevel,

    #[clap(subcommand)]
    command: Command,
}

#[derive(Clone, Copy, Debug, clap::ArgEnum)]
enum LogLevel {
    Off,
    Error,
    Warn,
    Info,
    #[cfg(any(not(target_env = "sgx"), debug_assertions))]
    Debug,
    #[cfg(any(not(target_env = "sgx"), debug_assertions))]
    Trace,
}

#[derive(Debug, clap::Subcommand)]
enum Command {
    GenCsr {
        /// The path to the SEC1 PEM-encoded P-256 (prime256v1) private key used to sign the CSR.
        ///
        /// Generated, for instance, by `openssl ecparam -genkey -name prime256v1 -noout`
        #[cfg(not(target_env = "sgx"))]
        #[clap(short = 'k', long, parse(try_from_os_str = ensure_file_exists))]
        tls_secret_key_path: PathBuf,

        /// The Relative Distinguised Name Sequence (RDNSequence) for the CSR's Subject,
        /// with format as specified in https://datatracker.ietf.org/doc/html/rfc4514.
        ///
        /// For example:
        /// `C=US,ST=California,L=San Francisco,O=Oasis Labs,CN=sapphire-proxy.oasislabs.com`
        #[clap(long)]
        subject: String,
    },
    Serve {
        /// The server listen address.
        #[clap(short, long, default_value = "127.0.0.1:23294")]
        listen_addr: std::net::SocketAddr,

        /// The URL of the upstream Web3 gateway.
        #[clap(long, default_value = "http://localhost:8545")]
        web3_gateway_url: url::Url,

        /// The maximum size of a Web3 request that this server will process.
        #[clap(long, hide = true, default_value = "1048576")]
        max_request_size_bytes: usize,

        /// The public key of the Sapphire paratime to which this proxy is indirectly connected.
        #[clap(long, parse(try_from_str = parse_byte_array))]
        runtime_public_key: [u8; 32],

        /// The path on disk to the SEC1 PEM-encoded P-256 (prime256v1) private key.
        #[cfg(not(target_env = "sgx"))]
        #[clap(long, requires = "tls-cert-path", parse(try_from_os_str = ensure_file_exists))]
        tls_secret_key_path: Option<PathBuf>,

        /// The path on disk to the TLS cert that this server will present.
        /// If provided, all requests will required to use TLS.
        #[cfg_attr(not(target_env = "sgx"), clap(requires = "tls-private-key-path"))]
        #[clap(long, parse(try_from_os_str = ensure_file_exists))]
        tls_cert_path: Option<PathBuf>,
    },
}

fn parse_byte_array<const N: usize>(input: &str) -> Result<[u8; N], hex::FromHexError> {
    let input = input.trim_start_matches("0x");
    let mut arr = [0u8; N];
    hex::decode_to_slice(input, &mut arr)?;
    Ok(arr)
}
// fn parse_byte_array<const N: usize>(input: &str) -> Result<[u8; N], base64::DecodeError> {
//     let bytes = base64::decode(input)?;
//     if bytes.len() != N {
//         return Err(base64::DecodeError::InvalidLength);
//     }
//     let mut arr = [0u8; N];
//     arr.copy_from_slice(&bytes);
//     Ok(arr)
// }

fn ensure_file_exists(s: &std::ffi::OsStr) -> Result<PathBuf> {
    let p = PathBuf::from(s);
    anyhow::ensure!(p.exists(), "file does not exist");
    Ok(p)
}

fn read_file(p: &std::path::Path) -> Result<Vec<u8>> {
    std::fs::read(p).map_err(|e| Error::from(e).context(format!("could not read {}", p.display())))
}
