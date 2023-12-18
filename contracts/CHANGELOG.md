# Change Log

All notables changes to this project are documented in this file.

The format is inspired by [Keep a Changelog].

[Keep a Changelog]: https://keepachangelog.com/en/1.0.0/

## 0.2.5 (2023-12-18)

### Added

 - Subcall.sol support for staking & delegation

### Changed

 - Many OPL Endpoint errors are now reported using `require` rather than raised using `revert` due to bug in Celer IM MessageBus which reports them as 'reverted silently' and omitting the error.

### Removed

 - Unused `ERC2771Context` from `opl/Enclave.sol`