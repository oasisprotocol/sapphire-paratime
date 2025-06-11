# The Sapphire ParaTime

[![CI lint status][github-ci-lint-badge]][github-ci-lint-link]
[![CI audit status][github-ci-audit-badge]][github-ci-audit-link]

<!-- markdownlint-disable line-length -->
[github-ci-lint-badge]: https://github.com/oasisprotocol/sapphire-paratime/workflows/ci-lint/badge.svg
[github-ci-lint-link]: https://github.com/oasisprotocol/sapphire-paratime/actions?query=workflow:ci-lint+branch:main
[github-ci-audit-badge]: https://github.com/oasisprotocol/sapphire-paratime/workflows/ci-audit/badge.svg
[github-ci-audit-link]: https://github.com/oasisprotocol/sapphire-paratime/actions?query=workflow:ci-audit+branch:main
<!-- markdownlint-enable line-length -->

This is the Sapphire ParaTime, an [Oasis] official ParaTime for the [Oasis
Network] built using the [Oasis SDK]. It's chock-full of Oasis.

[Oasis]: https://oasis.net/
[Oasis Network]: https://docs.oasis.io/oasis-network-primer/
[Oasis SDK]: https://github.com/oasisprotocol/oasis-sdk

## Note

* **The code has not yet been audited.**

## SGX and Non-SGX Variants of the Binary

The non-SGX variant is a regular ELF binary that can be used by Oasis nodes
without SGX support to operate as client nodes.

This allows (non-SGX) Oasis nodes to interact with the Sapphire ParaTime (e.g.
perform non-confidential queries and validate transactions they send out) but
they cannot participate in the execution of Sapphire ParaTime's transactions and
they cannot see its confidential state.

## Building

### Prerequisites

#### Rust

Ensure you have [Rust] and [rustup] installed on your system.
For more details, see [Oasis Core's Development Setup Prerequisites]
documentation, the Rust section.

The version of the Rust toolchain we use for the Sapphire ParaTime is specified
in the [rust-toolchain.toml] file.

The rustup-installed versions of `cargo`, `rustc` and other tools will
[automatically detect this file and use the appropriate version of the Rust
toolchain][rust-toolchain-precedence] when invoked from the Sapphire ParaTime
git checkout directory.

If rust toolchain is not installed on your device, you can install it like this:

```shell
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

To install the appropriate version of the Rust toolchain, make sure you are
in an Sapphire ParaTime git checkout directory and run:

```shell
rustup show
```

This will automatically install the appropriate Rust toolchain (if not
present) and output something similar to:

```
...

active toolchain
----------------

nightly-nightly-2022-02-16-x86_64-unknown-linux-gnu (overridden by '...')
rustc 1.60.0-nightly (09cb29c64 2022-02-15)
```

[Rust]: https://www.rust-lang.org/
[rustup]: https://rustup.rs/
[Oasis Core's Development Setup Prerequisites]:
  https://docs.oasis.io/oasis-core/development-setup/prerequisites
[rust-toolchain.toml]: rust-toolchain.toml
[rust-toolchain-precedence]:
  https://github.com/rust-lang/rustup/blob/master/README.md#override-precedence

#### Fortanix SGX tools

Add the Fortanix SGX tools by running:

```shell
cargo install --locked fortanix-sgx-tools sgxs-tools
```

### Mock SGX Binary

Mock SGX allows a developer to run the Sapphire ParaTime binary without
performing the attestation and requiring actual SGX hardware. While you can't
connect to a production Mainnet or Testnet with such a setup, it is useful for
testing Sapphire locally and/or testing dApps that require
Sapphire-specific features, for example in the CI environments.

To build the unsafe, mock SGX binary of the Sapphire ParaTime for Localnet
checkout the appropriate version and run:

```shell
export OASIS_UNSAFE_SKIP_AVR_VERIFY=1 OASIS_UNSAFE_ALLOW_DEBUG_ENCLAVES=1 OASIS_UNSAFE_USE_LOCALNET_CHAINID=1
cargo build --release --locked --features debug-mock-sgx
```

The resulting ELF binary is located at `target/release/sapphire-paratime`.

_NOTE: The mock SGX binary is dynamically linked so it may not be portable
between machines with different versions of shared libraries._

### SGX Binary

To build the SGX binary of the Sapphire ParaTime, checkout the appropriate
version and run:

```shell
cargo build --release --target x86_64-fortanix-unknown-sgx --locked
cargo elf2sgxs --release
```

The resulting SGX binary is located at
`target/x86_64-fortanix-unknown-sgx/release/sapphire-paratime.sgxs`.

_NOTE: The SGX binary is always statically linked so it doesn't exhibit the
portability issues the ELF binary has._

## Debugging

The [sapphire-localnet] Docker container can be launched with a locally built
debug build of the Sapphire paratime. The `Makefile` contains commands to build
and then bind-mount the executable into the container.

```shell
make debug
```

This can be very useful when debugging or testing new features against Ethereum
compatible RPC clients.

[sapphire-localnet]: https://github.com/oasisprotocol/oasis-web3-gateway/pkgs/container/sapphire-localnet
