# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.4.1 (2025-10-28)

### Fixed

- Fixed crash when running view calls without selected account

## 0.4.0 (2025-04-03)

### Fixed

- Fixed Python client compatibility with web3.py version 7.x by:
  - Adding async/await support for AsyncWeb3 client
  - Adding proper type annotations for signed_call_data using AttributeDict
  - Implementing async middleware for the Sapphire client

### Changed

- Changed web3.py version requirement to web3==7.*
- No backwards compatibility, web3 version 6.x and lower will throw an error
  when using sapphirepy wrapper

## 0.3.0

- Initial public release based on web3.py version 6
