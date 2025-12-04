# Change Log

All notables changes to this project are documented in this file.

The format is inspired by [Keep a Changelog].

[Keep a Changelog]: https://keepachangelog.com/en/1.0.0/

## 2.3.0 (2025-12)

### Added

- PontusX Devnet and Testnet chains to `NETWORKS`

## 2.2.0 (2025-05)

### Added

- Preconfigured `NETWORKS` are now compatible with `wallet_addEthereumChain`

### Fixed

- Don't throw on `eth_chainId` request on non-sapphire chain

## 2.1.0 (2025-02)

### Added

- Enabled Snap connection in Sapphire integrations

### Fixed

- Support Brave wallet default

## 2.0.1 (2024-09)

https://github.com/oasisprotocol/sapphire-paratime/milestone/2?closed=1

### Fixed

- Use `core.CallDataPublicKey` subcall, instead of `oasis_callDataPublicKey` RPC call

## 2.0.0-next.1 (2024-08)

### Fixed

- Use PNPM to publish packaging, so `workspace:^` links in package.json get translated to their correct versions.

## 2.0.0-alpha.1 (2024-06)

### Added

- Wagmi v2 & Viem v2 support, with `hardhat-viem` & wagmi examples

### Fixed

- Calldata public key encryption/decryption routines are no longer async
- KeyFetcher has `runInBackground` method to eagerly fetch the keys

### Changed

- Supports only Node v18+

## 1.3.2 (2024-02-06)

### Changed

- Refactored calldata public key handling
- Added `epoch` support for calldata public key, which makes web UIs which are open for a long time more reliable

## 1.3.1 (2024-01-26)

### Fixed

- Ethers v6 signed queries
- Removed ethers & @noble/hashes from peer dependencies

### Deprecated

- Web3.js is not supported

## 1.3.0 (2024-01-24)

### Changed

- Uses Ethers v6 behind the scenes

## 1.2.0 (2023-11-15)

### Added

- Gas estimation

### Removed

- Truffle support
