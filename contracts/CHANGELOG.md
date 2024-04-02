# Change Log

All notables changes to this project are documented in this file.

The format is inspired by [Keep a Changelog].

[Keep a Changelog]: https://keepachangelog.com/en/1.0.0/

## 0.2.8 (2024-03-15)

### Fixed

 * Declare `@openzeppelin/contracts` as a dependency

### Removed

 - Minimally used `Context` from `opl/Endpoint.sol`

## 0.2.7 (2024-01-17)

### Fixed

 * Endpoint.sol had incorrect mainnet address for Celer IM MessageBus in `_getChainConfig`

## 0.2.6 (2023-12-18)

### Added

 - Subcall.sol support for staking & delegation

### Changed

 - Many OPL Endpoint errors are now reported using `require` rather than raised using `revert` due to bug in Celer IM MessageBus which reports them as 'reverted silently' and omitting the error.

### Removed

 - Unused `ERC2771Context` from `opl/Enclave.sol`

## 0.2.5 (2023-12-02)

### Added

 * padGas & gasUsed precompile support in Sapphire.sol
 * SEC P256 R1 curve support
 * SHA512_256, SHA512 & SHA384 hash support

## 0.2.4 (2023-08-02)

### Fixed

 * Compile warning in EthereumUtils.sol
 * Corrected MessageBus address in opl/Endpoint.sol

## 0.2.3 (2023-07-17)

### Added

 * EIP-155 compatible signing

## 0.2.2 (2023-07-12)

### Added

 * Ethereum signature compatibliity (EthereumUtils)
