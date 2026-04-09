# Change Log

All notables changes to this project are documented in this file.

The format is inspired by [Keep a Changelog].

[Keep a Changelog]: https://keepachangelog.com/en/1.0.0/

## 2.22.3 (2026-04)

### Fixed

- Reduce poll interval to 100 ms when running on Sapphire Localnet. This speeds up tests roughly 4-fold.

## 2.22.2 (2025-02)

Publish stable V2 integration.

## 2.22.2-next.0 (2024-08)

### Fixed

- Use PNPM to publish packaging, so `workspace:^` links in package.json get translated to their correct versions.
