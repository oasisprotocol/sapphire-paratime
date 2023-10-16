# Sapphire Paratime

[![ci-lint](https://github.com/oasisprotocol/sapphire-paratime/actions/workflows/ci-lint.yaml/badge.svg)](https://github.com/oasisprotocol/sapphire-paratime/actions/workflows/ci-lint.yaml)
[![ci-test](https://github.com/oasisprotocol/sapphire-paratime/actions/workflows/ci-test.yaml/badge.svg)](https://github.com/oasisprotocol/sapphire-paratime/actions/workflows/ci-test.yaml)

The Sapphire ParaTime is the official confidential EVM Compatible ParaTime
providing a smart contract development environment with EVM compatibility
on the Oasis Network.

This monorepo includes the source code for the following Sapphire packages:

- TypeScript [client](https://www.npmjs.com/package/@oasisprotocol/sapphire-paratime) ![npm](https://img.shields.io/npm/v/@oasisprotocol/sapphire-paratime)
- Golang [client](https://pkg.go.dev/github.com/oasisprotocol/sapphire-paratime)
![GitHub go.mod Go version (branch & subdirectory of monorepo)](https://img.shields.io/github/go-mod/go-version/oasisprotocol/sapphire-paratime?filename=clients%2Fgo%2Fgo.mod)

- Solidity [smart contracts](https://www.npmjs.com/package/@oasisprotocol/sapphire-contracts) ![npm](https://img.shields.io/npm/v/@oasisprotocol/sapphire-contracts)
- Hardhat [plugin](https://www.npmjs.com/package/@oasisprotocol/sapphire-hardhat) ![npm](https://img.shields.io/npm/v/@oasisprotocol/sapphire-hardhat)

## Documentation

The Sapphire Paratime documentation is deployed as part of the full set of Oasis [docs](https://docs.oasis.io/dapp/sapphire/)
based on this open source [repository](https://github.com/oasisprotocol/docs). Auto-generated API documentation is available at:

 * https://api.docs.oasis.io/js/sapphire-paratime/
 * https://api.docs.oasis.io/sol/sapphire-contracts/

## Layout

This repository includes all relevant Sapphire and dependencies organized into
the following directories:

- [`clients`](./clients): the Go and TypeScript clients
- [`contracts`](./contracts): Sapphire and [OPL](https://docs.oasis.io/dapp/opl/) smart contracts
- [`examples`](./examples/): sample code snippets in popular Ethereum
development environments
- [`integrations`](./integrations/): plugins with popular Solidity tools
- [`runtime`](./runtime/): the Sapphire Paratime as based off of the
[Oasis SDK](https://github.com/oasisprotocol/oasis-sdk)

## Release

### Clients

JS libraries should be updated with a version bump in the `package.json`
file and a respective tag in the pattern of `{{path}}/v{{semver}}`, such as
`clients/js/v1.1.1`.


## Contributing

Developers are encouraged to contribute their improvements to the Sapphire
Paratime through this repository. Open a pull request and one of the Oasis
Protocol Foundation members will check it out and get back to you!

See our [Contributing Guidelines](CONTRIBUTING.md).

## Build

Oasis remains committed to unlocking the full potential of privacy applications
on Web3.

Build with [us](https://oasisprotocol.org/opl#how-to-get-started) today!
