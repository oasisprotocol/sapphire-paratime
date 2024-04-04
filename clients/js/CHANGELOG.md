# Change Log

All notables changes to this project are documented in this file.

The format is inspired by [Keep a Changelog].

[Keep a Changelog]: https://keepachangelog.com/en/1.0.0/

## 1.3.3 (2024-04-04)

### Added

- Wagmi v2 & Viem v2 support
- `hardhat-viem` example

### Fixed

- Calldata public key encryption/decryption routines are no longer async

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
