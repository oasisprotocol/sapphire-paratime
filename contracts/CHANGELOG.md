# Change Log

All notables changes to this project are documented in this file.

The format is inspired by [Keep a Changelog].

[Keep a Changelog]: https://keepachangelog.com/en/1.0.0/

## 0.2.14 (2025-03)

### Added

* `SiweAuth.AuthToken` contains new `statement` and `resources` fields that can
  be used for finer-grained authentication.

## 0.2.13 (2025-03)

### Changed

* `SiweAuth._domain` visibility changed from private to internal, so a
  subcontract can change it if wanted

### Removed

* Obsolete warning in Sapphire.sol `randomBytes()` for Sapphire versions prior
  to 0.6.0

## 0.2.12 (2025-01)

### Added

* HMAC using SHA512-256
* Calldata encryption
* `EIP1159Signer` and `EIP2930Signer` contracts

### Changed

* Data location of `token` parameter in `auth/SiweAuth.sol:authMsgSender`
  changed from `calldata` to `memory` for convenience e.g. to allow passing
  string literal
* New prefixes for SIWE related errors
* Move CBOR parser into separate `CBOR.sol` module

### Fixed

* `avalanche-fuji` chain ID

### Removed

* `goerli`, `polygon-mumbai` and `arbitrum-testnet` deprecated OPL/Celer
  endpoints

## 0.2.11 (2024-09)

### Added

 * `Subcall.sol` support for `core.CallDataPublicKey` and `core.CurrentEpoch`

## 0.2.10 (2024-08-20)

### Added

 * `Subcall.sol` support for ROFL app authorized origin checks

## 0.2.9 (2024-07-30)

### Fixed

 * CBOR unsigned integer decoding in Subcall.sol
 * Subcall undelegation done receipt

### Added

 * Initial SIWE support

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
