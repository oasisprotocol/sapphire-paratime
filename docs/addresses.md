---
description: List of Standard Contract Addresses
---

# Contract Addresses and Deployments

## Standard Contract Addresses

| Name                       | Mainnet Address                                            | Testnet Address                                            | Source                             |
|----------------------------|------------------------------------------------------------|------------------------------------------------------------|------------------------------------|
| [Multicall V3][multicall]  | [`0xcA11bde05977b3631167028862bE2a173976CA11`][mc-mainnet] | [`0xcA11bde05977b3631167028862bE2a173976CA11`][mc-testnet] | [Multicall3.sol][multicall-source] |
| [CreateX][createx]         | [`0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed`][cx-mainnet] | [`0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed`][cx-testnet] | [Createx.sol][createx-source]      |
| [Wrapped ROSE][wrose-dapp] | [`0x8Bc2B030b299964eEfb5e1e0b36991352E56D2D3`][wr-mainnet] | [`0xB759a0fbc1dA517aF257D5Cf039aB4D86dFB3b94`][wr-testnet] | [WrappedROSE.sol][wrose-source]    |

[multicall-source]: https://github.com/mds1/multicall/blob/main/src/Multicall3.sol
[multicall]: https://multicall3.com/
[mc-mainnet]: https://explorer.oasis.io/mainnet/sapphire/address/0xcA11bde05977b3631167028862bE2a173976CA11
[mc-testnet]: https://explorer.oasis.io/testnet/sapphire/address/0xcA11bde05977b3631167028862bE2a173976CA11

[createx]: https://github.com/pcaversaccio/createx/
[createx-source]: https://github.com/pcaversaccio/createx/blob/main/src/CreateX.sol
[cx-mainnet]: https://explorer.oasis.io/mainnet/sapphire/address/0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed
[cx-testnet]: https://explorer.oasis.io/testnet/sapphire/address/0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed

[wrose-dapp]: https://rose.oasis.io/wrap
[wrose-source]: https://github.com/oasisprotocol/sapphire-paratime/blob/main/contracts/contracts/WrappedROSE.sol
[wr-mainnet]: https://explorer.oasis.io/mainnet/sapphire/address/0x8Bc2B030b299964eEfb5e1e0b36991352E56D2D3
[wr-testnet]: https://explorer.oasis.io/testnet/sapphire/address/0xB759a0fbc1dA517aF257D5Cf039aB4D86dFB3b94


## Celer cBridge Tokens (Mainnet)
<!-- NOTE: this is generated using `_fetch-cbridge-tokens.py` -->
<!-- WARNING: please don't manually update the table! -->
| Source Chain | Token Name | Source Address | Dest. Chain | Dest Address |
| ------------ | ---------- | -------------- | ----------- | ------------ |
| Ethereum Mainnet (1) | OCEAN | [`0x967da4048cD07aB37855c090aAF366e4ce1b9F48`](https://etherscan.io/address/0x967da4048cD07aB37855c090aAF366e4ce1b9F48) | Oasis Sapphire (23294) | [`0x39d22B78A7651A76Ffbde2aaAB5FD92666Aca520`](https://explorer.oasis.io/mainnet/sapphire/address/0x39d22B78A7651A76Ffbde2aaAB5FD92666Aca520) |
| Ethereum Mainnet (1) | USDC | [`0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`](https://etherscan.io/address/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48) | Oasis Sapphire (23294) | [`0x2c2E3812742Ab2DA53a728A09F5DE670Aba584b6`](https://explorer.oasis.io/mainnet/sapphire/address/0x2c2E3812742Ab2DA53a728A09F5DE670Aba584b6) |
| Ethereum Mainnet (1) | USDT | [`0xdAC17F958D2ee523a2206206994597C13D831ec7`](https://etherscan.io/address/0xdAC17F958D2ee523a2206206994597C13D831ec7) | Oasis Sapphire (23294) | [`0xE48151964556381B33f93E05E36381Fd53Ec053E`](https://explorer.oasis.io/mainnet/sapphire/address/0xE48151964556381B33f93E05E36381Fd53Ec053E) |
| Ethereum Mainnet (1) | WBTC | [`0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599`](https://etherscan.io/address/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599) | Oasis Sapphire (23294) | [`0xE9533976C590200E32d95C53f06AE12d292cFc47`](https://explorer.oasis.io/mainnet/sapphire/address/0xE9533976C590200E32d95C53f06AE12d292cFc47) |
| Ethereum Mainnet (1) | WETH | [`0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`](https://etherscan.io/address/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2) | Oasis Sapphire (23294) | [`0xfc6b18d694F2D137dB762B152736Ba098F9808d9`](https://explorer.oasis.io/mainnet/sapphire/address/0xfc6b18d694F2D137dB762B152736Ba098F9808d9) |
| BNB Chain (56) | BNB | [`0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c`](https://bscscan.com/address/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c) | Oasis Sapphire (23294) | [`0xe95E3a9f1a45B5EDa71781448F6047d7B7e31cbF`](https://explorer.oasis.io/mainnet/sapphire/address/0xe95E3a9f1a45B5EDa71781448F6047d7B7e31cbF) |
| Polygon PoS (137) | MATIC | [`0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270`](https://polygonscan.com/address/0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270) | Oasis Sapphire (23294) | [`0xa349005a68FA33e8DACAAa850c45175bbcD49B19`](https://explorer.oasis.io/mainnet/sapphire/address/0xa349005a68FA33e8DACAAa850c45175bbcD49B19) |
| Oasis Sapphire (23294) | wROSE | [`0x8Bc2B030b299964eEfb5e1e0b36991352E56D2D3`](https://explorer.oasis.io/mainnet/sapphire/address/0x8Bc2B030b299964eEfb5e1e0b36991352E56D2D3) | BNB Chain (56) | [`0xF00600eBC7633462BC4F9C61eA2cE99F5AAEBd4a`](https://bscscan.com/address/0xF00600eBC7633462BC4F9C61eA2cE99F5AAEBd4a) |

## Celer cBridge Tokens (Testnet)
<!-- NOTE: this is generated using `_fetch-cbridge-tokens.py` -->
<!-- WARNING: please don't manually update the table! -->
| Source Chain | Token Name | Source Address | Dest. Chain | Dest Address |
| ------------ | ---------- | -------------- | ----------- | ------------ |
| Oasis Sapphire Testnet (23295) | wROSE | [`0xB759a0fbc1dA517aF257D5Cf039aB4D86dFB3b94`](https://testnet.explorer.sapphire.oasis.dev/address/0xB759a0fbc1dA517aF257D5Cf039aB4D86dFB3b94) | BSC Testnet (97) | [`0x26a6f43BaEDD1767c283e2555A9E1236E5aE3A55`](https://testnet.bscscan.com/address/0x26a6f43BaEDD1767c283e2555A9E1236E5aE3A55) |

## Deployments

| Name | Mainnet Address | Testnet Address | Source |
| ---- | --------------- | --------------- | ------ |
| [Celer IM Executor][message-executor] | Multiple executors available | [`0x9C850D230FFFaCEf1E2D1741a00080856630e455`][message-executor-testnet] | [Message Executor][message-executor-source] |
| [Celer MessageBus][message-bus] | [`0x9Bb46D5100d2Db4608112026951c9C965b233f4D`][message-bus-mainnet] | [`0x9Bb46D5100d2Db4608112026951c9C965b233f4D`][message-bus-testnet] | [Message bus][message-bus-source] |
| [Safe Singleton Factory][singleton-factory] | [`0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7`][singleton-factory-mainnet] | [`0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7`][singleton-factory-testnet] | [Singleton Factory][singleton-factory] |
| [Band Oracle][band-oracle] | [`0xDA7a001b254CD22e46d3eAB04d937489c93174C3`][band-oracle-mainnet] | [`0x0c2362c9A0586Dd7295549C65a4A5e3aFE10a88A`][band-oracle-testnet] | [Oracle][band-oracle-source] |
| [Router Gateway][router-gateway] | [`0x86dfc31d9cb3280ee1eb1096caa9fc66299af973`][router-gateway-mainnet] | [`0xfbE6D1e711CC2BC241dfa682CBbFF6D68bf62e67`][router-gateway-testnet] | [Gateway][router-gateway-source] |
| [Router Asset Forwarder][router-forwarder] | [`0x21c1e74caadf990e237920d5515955a024031109`][router-forwarder-mainnet] | - | [Asset Forwarder][router-forwarder-source] |
| [Router Asset Bridge][router-bridge] | [`0x01b4ce0d48ce91eb6bcaf5db33870c65d641b894`][router-bridge-mainnet] | - | [Asset Bridge][router-bridge-source] |

[message-executor]: https://im-docs.celer.network/developer/development-guide/message-executor
[message-executor-source]: https://github.com/celer-network/im-executor
[message-executor-testnet]: https://explorer.oasis.io/testnet/sapphire/address/0x9C850D230FFFaCEf1E2D1741a00080856630e455
[message-bus]: https://im-docs.celer.network/developer/development-guide/message-executor
[message-bus-source]: https://github.com/celer-network/sgn-v2-contracts/blob/6af81b55a13a7aacab9a4d92a38d374d46c0fdbf/contracts/message/messagebus/MessageBus.sol
[message-bus-mainnet]: https://explorer.oasis.io/mainnet/sapphire/address/0x9Bb46D5100d2Db4608112026951c9C965b233f4D
[message-bus-testnet]: https://explorer.oasis.io/testnet/sapphire/address/0x9Bb46D5100d2Db4608112026951c9C965b233f4D
[singleton-factory]: https://github.com/safe-global/safe-singleton-factory/
[singleton-factory-mainnet]: https://explorer.oasis.io/mainnet/sapphire/address/0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7
[singleton-factory-testnet]: https://explorer.oasis.io/testnet/sapphire/address/0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7
[band-oracle]: https://docs.bandchain.org/
[band-oracle-source]: https://github.com/bandprotocol/band-std-reference-contracts-solidity
[band-oracle-mainnet]: https://explorer.oasis.io/mainnet/sapphire/address/0xDA7a001b254CD22e46d3eAB04d937489c93174C3
[band-oracle-testnet]: https://explorer.oasis.io/testnet/sapphire/address/0x0c2362c9A0586Dd7295549C65a4A5e3aFE10a88A
[router-gateway]: https://docs.routerprotocol.com/develop/message-transfer-via-crosstalk/key-concepts/high-level-architecture
[router-forwarder]: https://docs.routerprotocol.com/develop/message-transfer-via-crosstalk/key-concepts/high-level-architecture
[router-bridge]: https://docs.routerprotocol.com/develop/message-transfer-via-crosstalk/key-concepts/high-level-architecture
[router-gateway-source]: https://github.com/router-protocol/router-contracts/tree/main/gateway/evm
[router-bridge-source]: https://github.com/router-protocol/router-contracts/tree/main/asset-bridge/evm
[router-forwarder-source]: https://github.com/router-protocol/router-contracts/tree/main/asset-forwarder/evm
[router-gateway-mainnet]: https://explorer.oasis.io/mainnet/sapphire/address/0x86DFc31d9cB3280eE1eB1096caa9fC66299Af973
[router-forwarder-mainnet]: https://explorer.oasis.io/mainnet/sapphire/address/0x21c1e74caadf990e237920d5515955a024031109
[router-bridge-mainnet]: https://explorer.oasis.io/mainnet/sapphire/address/0x01b4ce0d48ce91eb6bcaf5db33870c65d641b894
[router-gateway-testnet]: https://explorer.oasis.io/testnet/sapphire/address/0xfbE6D1e711CC2BC241dfa682CBbFF6D68bf62e67
