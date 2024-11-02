# Sapphire Paratime

[![license](https://img.shields.io/github/license/oasisprotocol/sapphire-paratime.svg)](https://github.com/oasisprotocol/sapphire-paratime/blob/main/LICENSE)
[![ci-lint](https://github.com/oasisprotocol/sapphire-paratime/actions/workflows/ci-lint.yaml/badge.svg)](https://github.com/oasisprotocol/sapphire-paratime/actions/workflows/ci-lint.yaml)
[![ci-test](https://github.com/oasisprotocol/sapphire-paratime/actions/workflows/ci-test.yaml/badge.svg)](https://github.com/oasisprotocol/sapphire-paratime/actions/workflows/ci-test.yaml)
[![ci-test](https://github.com/oasisprotocol/sapphire-paratime/actions/workflows/contracts-test.yaml/badge.svg)](https://github.com/oasisprotocol/sapphire-paratime/actions/workflows/contracts-test.yaml)
[![ci-test](https://github.com/oasisprotocol/sapphire-paratime/actions/workflows/ci-playwright.yaml/badge.svg)](https://github.com/oasisprotocol/sapphire-paratime/actions/workflows/ci-playwright.yaml)

The Sapphire ParaTime is the official confidential EVM Compatible ParaTime
providing a smart contract development environment with EVM compatibility
on the Oasis Network.

This monorepo includes the source code for the following Sapphire packages:

| Sub-Project                               | Version                                        | Size                                              | Downloads                         |
| ----------------------------------------- | ---------------------------------------------- | ------------------------------------------------- | --------------------------------- |
| [TypeScript][client-npm]           | [![version][client-version]][client-npm]       | [![size][client-size]][client-bundlephobia]       | ![downloads][client-downloads]    |
| [Go][go-pkg]                       | [![version][go-version]][go-pkg]               |                                                   |                                   |
| [Solidity][contracts-npm] | [![version][contracts-version]][contracts-npm] |                                                   | ![downloads][contracts-downloads] |
| [Hardhat][hardhat-npm]             | [![version][hardhat-version]][hardhat-npm]     | [![size][hardhat-size]][hardhat-bundlephobia]     | ![downloads][hardhat-downloads]   |
| [Ethers 6.x][ethers-v6-npm]       | [![version][ethers-v6-version]][ethers-v6-npm] | [![size][ethers-v6-size]][ethers-v6-bundlephobia] | ![downloads][ethers-v6-downloads] |
| [Wagmi 2.x][wagmi-v2-npm]         | [![version][wagmi-v2-version]][wagmi-v2-npm]   | [![size][wagmi-v2-size]][wagmi-v2-bundlephobia]   | ![downloads][wagmi-v2-downloads]  |
| [Viem 2.x][viem-v2-npm]           | [![version][viem-v2-version]][viem-v2-npm]     | [![size][viem-v2-size]][viem-v2-bundlephobia]     | ![downloads][viem-v2-downloads]   |


[go-pkg]: https://pkg.go.dev/github.com/oasisprotocol/sapphire-paratime

[hardhat-npm]: https://www.npmjs.com/package/@oasisprotocol/sapphire-hardhat
[contracts-npm]: https://www.npmjs.com/package/@oasisprotocol/sapphire-contracts
[client-npm]: https://www.npmjs.com/package/@oasisprotocol/sapphire-paratime
[ethers-v6-npm]: https://www.npmjs.com/package/@oasisprotocol/sapphire-ethers-v6
[viem-v2-npm]: https://www.npmjs.com/package/@oasisprotocol/sapphire-viem-v2
[wagmi-v2-npm]: https://www.npmjs.com/package/@oasisprotocol/sapphire-wagmi-v2

[go-version]: https://img.shields.io/github/go-mod/go-version/oasisprotocol/sapphire-paratime?filename=clients%2Fgo%2Fgo.mod
[hardhat-version]: https://img.shields.io/npm/v/@oasisprotocol/sapphire-hardhat
[contracts-version]: https://img.shields.io/npm/v/@oasisprotocol/sapphire-contracts
[client-version]: https://img.shields.io/npm/v/@oasisprotocol/sapphire-paratime
[ethers-v6-version]: https://img.shields.io/npm/v/@oasisprotocol/sapphire-ethers-v6
[viem-v2-version]: https://img.shields.io/npm/v/@oasisprotocol/sapphire-viem-v2
[wagmi-v2-version]: https://img.shields.io/npm/v/@oasisprotocol/sapphire-wagmi-v2

[hardhat-size]: https://img.shields.io/bundlephobia/minzip/@oasisprotocol/sapphire-hardhat
[client-size]: https://img.shields.io/bundlephobia/minzip/@oasisprotocol/sapphire-paratime
[ethers-v6-size]: https://img.shields.io/bundlephobia/minzip/@oasisprotocol/sapphire-ethers-v6
[viem-v2-size]: https://img.shields.io/bundlephobia/minzip/@oasisprotocol/sapphire-viem-v2
[wagmi-v2-size]: https://img.shields.io/bundlephobia/minzip/@oasisprotocol/sapphire-wagmi-v2

[hardhat-bundlephobia]: https://bundlephobia.com/package/@oasisprotocol/sapphire-hardhat
[client-bundlephobia]: https://bundlephobia.com/package/@oasisprotocol/sapphire-paratime
[ethers-v6-bundlephobia]: https://bundlephobia.com/package/@oasisprotocol/sapphire-ethers-v6
[viem-v2-bundlephobia]: https://bundlephobia.com/package/@oasisprotocol/sapphire-viem-v2
[wagmi-v2-bundlephobia]: https://bundlephobia.com/package/@oasisprotocol/sapphire-wagmi-v2

[hardhat-downloads]: https://img.shields.io/npm/dm/@oasisprotocol/sapphire-hardhat.svg
[contracts-downloads]: https://img.shields.io/npm/dm/@oasisprotocol/sapphire-contracts.svg
[client-downloads]: https://img.shields.io/npm/dm/@oasisprotocol/sapphire-paratime.svg
[ethers-v6-downloads]: https://img.shields.io/npm/dm/@oasisprotocol/sapphire-ethers-v6.svg
[viem-v2-downloads]: https://img.shields.io/npm/dm/@oasisprotocol/sapphire-viem-v2.svg
[wagmi-v2-downloads]: https://img.shields.io/npm/dm/@oasisprotocol/sapphire-wagmi-v2.svg

## Layout

This repository includes all relevant Sapphire and dependencies organized into
the following directories:

- [`clients`](./clients): the Go, Python and JavaScript/TypeScript clients
- [`contracts`](./contracts): Sapphire and [OPL](https://docs.oasis.io/dapp/opl/) smart contracts
- [`docs`](./docs): topic-oriented Sapphire documentation
- [`examples`](./examples/): sample code snippets in popular Ethereum
development environments
- [`integrations`](./integrations/): plugins for popular Ethereum SDKs
- [`runtime`](./runtime/): the Sapphire Paratime as based off of the
[Oasis SDK](https://github.com/oasisprotocol/oasis-sdk)

## Documentation

The Sapphire documentation is deployed as part of the official
[Oasis documentation](https://docs.oasis.io/dapp/sapphire/). To make changes
visible on the docs website:

1. Merge any changes in the `docs` folder to the `main` branch.
2. Bump the git commit reference of the Sapphire submodule inside the `external`
   directory of the [Oasis docs repository](https://github.com/oasisprotocol/docs)
   (you can simply approve the auto-generated dependabot's submodule bump PR).
3. Merge changes into Oasis docs repository `main` branch. CI will deploy the
   docs to the website automatically.

Note: If you want to introduce a new markdown file, you will need to add it to
the [Oasis documentation's sidebar](https://github.com/oasisprotocol/docs/blob/main/sidebarDapp.ts).
If you remove any chapters, don't forget to define sensible [redirects](https://github.com/oasisprotocol/docs/blob/main/redirects.ts).
For more info on how to write the Oasis documentation, manage images and
diagrams, reference cross-repo markdown files and similar consult the
[official README](https://github.com/oasisprotocol/docs/blob/main/README.md).

The API documentation is auto-generated from the corresponding Sapphire
clients and libraries. It is deployed at:

* https://api.docs.oasis.io/js/sapphire-paratime/
* https://api.docs.oasis.io/sol/sapphire-contracts/

The API docs are generated automatically every 15 minutes from the `main`
branch.

## Release

### Clients & Integrations

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

## License

This software is licensed under [Apache 2.0](./LICENSE).

The content of the documentation (the `/docs` folder) including the media (e.g.
images and diagrams) is licensed under [Creative Commons Attribution 4.0
International](./LICENSE-docs).
