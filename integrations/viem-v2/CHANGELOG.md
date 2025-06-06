# Change Log

All notables changes to this project are documented in this file.

The format is inspired by [Keep a Changelog].

[Keep a Changelog]: https://keepachangelog.com/en/1.0.0/

## 2.1.0 (2025-06)

### Added

- sapphireHttpTransport: Add support for passing arguments to enable url
  overriding and transport batching control

## 2.0.1 (2024-09)

https://github.com/oasisprotocol/sapphire-paratime/milestone/5

### Fixed

 - Viem v2 hangs in Node due to referenced interval timer
   - https://github.com/oasisprotocol/sapphire-paratime/pull/383

## 2.0.0-next.1 (2024-08)

### Fixed

 - Use PNPM to publish packaging, so `workspace:^` links in package.json get translated to their correct versions.
