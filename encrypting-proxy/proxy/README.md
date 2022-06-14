# sapphire-encrypting-proxy

Encryptes Web3 requests sent from an unmodified Web3 client to an unmodified
Web3 gateway and back from the Sapphire ParaTime.

## Building & Testing

```
# Development
cargo audit
cargo build
cargo test

# Release
cargo build --locked --release

# Release (SGX)
cargo build --locked --release --target x86_64-fortanix-unknown-sgx
```

## Fuzzing

```
# Print out the available fuzz targets.
cargo fuzz list

# Run the target.
RUSTFLAGS="-Ctarget-feature=+aes,+sse2,+ssse3" cargo fuzz run <target>
```
