# Change Log

All notables changes to this project are documented in this file.

The format is inspired by [Keep a Changelog].

[Keep a Changelog]: https://keepachangelog.com/en/1.0.0/

## 3.0.0 (2025-12)

### Changed

- Replace `createSapphireConfig()` with Wagmi's `createConfig()` and wrapping
  the connector with `wrapConnectorWithSapphire()`. This enables support for
  multiple chains inside the same dApp.
  To learn more about the migration, check the changes to the README file: 
  https://github.com/oasisprotocol/sapphire-paratime/commit/2da03e2792d59c0837b02635af6aabc13bdc395e

### Added

- Support for Viem's `createPublicClient()` for read-only contract calls with
  end-to-end encryption if `sapphireHttpTransport()` used.

## 2.1.0 (2025-04)

### Added

- EIP-6963 support

## 2.0.0-next.1 (2024-08)

### Fixed

 - Use PNPM to publish packaging, so `workspace:^` links in package.json get translated to their correct versions.
