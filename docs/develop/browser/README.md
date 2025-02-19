---
description: Integrating Sapphire in your web dApp
---

# Browser Support

This page provides guidance for developers looking to build confidential dApps
on Sapphire that work in web browsers and integrate with Metamask and other
Wallets. It covers supported libraries, best practices for secure transactions,
and steps for implementing the simple Sapphire TypeScript wrapper.

## Supported Libraries

| Library                                | Package                                           | API Reference     | GitHub                  |
| -------------------------------------- | ------------------------------------------------- | ----------------- | ----------------------- |
| **[Sapphire TypeScript Wrapper][s-p]** | [@oasisprotocol/sapphire-paratime][s-p-npmjs]     | [API][s-p-api]    | [GitHub][s-p-github]    |
| **[Ethers v6][ethers]**                | [@oasisprotocol/sapphire-ethers-v6][ethers-npmjs] | [API][ethers-api] | [GitHub][ethers-github] |
| **[Viem][viem]**                       | [@oasisprotocol/sapphire-viem-v2][viem-npmjs]     | [API][viem-api]   | [GitHub][viem-github]   |
| **[Wagmi][wagmi]**                     | [@oasisprotocol/sapphire-wagmi-v2][wagmi-npmjs]   | [API][wagmi-api]  | [GitHub][wagmi-github]  |

[s-p-npmjs]: https://www.npmjs.com/package/@oasisprotocol/sapphire-paratime
[s-p-api]: https://api.docs.oasis.io/js/sapphire-paratime/
[s-p-github]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/clients/js
[ethers-npmjs]: https://www.npmjs.com/package/@oasisprotocol/sapphire-ethers-v6
[ethers-api]: https://api.docs.oasis.io/js/sapphire-ethers-v6
[ethers-github]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/integrations/ethers-v6
[viem-npmjs]: https://www.npmjs.com/package/@oasisprotocol/sapphire-viem-v2
[viem-api]: https://api.docs.oasis.io/js/sapphire-viem-v2
[viem-github]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/integrations/viem-v2
[wagmi-npmjs]: https://www.npmjs.com/package/@oasisprotocol/sapphire-wagmi-v2
[wagmi-api]: https://api.docs.oasis.io/js/sapphire-wagmi-v2
[wagmi-github]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/integrations/wagmi-v2

## Choosing the Right Library

Many browser-based dApps can use the lightweight
[Sapphire TypeScript wrapper][s-p] if they rely entirely on the
injected EIP-1193 wallet provider (e.g. window.ethereum) to communicate with
and sign transactions on Sapphire. If you already use an EVM-frontend library,
use our library-specific packages such as [Ethers][ethers], [Viem][viem] or
[Wagmi][wagmi].

[s-p]: ./README.md#lightweight-sapphire-typescript-wrapper
[ethers]: ./ethers.md
[viem]: ./viem.md
[wagmi]: ./wagmi.md

:::info Example: Starter project

If your project includes both a smart contract backend and a web frontend, you
can explore our [demo-starter] repository. It provides a working example using
React and also includes a Vue branch.

:::

[demo-starter]: https://github.com/oasisprotocol/demo-starter

## Transaction encryption

When using the wrapper libraries, ensure that all transactions containing
sensitive information **are encrypted**. Encryption is essential to safeguard user
data and ensure privacy. To verify that a transaction is encrypted, you can
check the transaction details on the Oasis Block Explorer for the corresponding
network ([Localnet], [Testnet], or [Mainnet]). Look for a green lock icon next
to the transaction, which indicates that it is securely encrypted.

:::tip View-Call Authentication

For authenticated view calls, make sure to visit the [View-Call Authentication]
chapter to learn about the proper authentication procedures.

:::

[Localnet]: http://localhost:8548
[Testnet]: https://explorer.oasis.io/testnet/sapphire
[Mainnet]: https://explorer.oasis.io/mainnet/sapphire
[View-Call Authentication]: ../authentication.md

## Lightweight Sapphire TypeScript Wrapper

The Sapphire TypeScript wrapper from our
[`@oasisprotocol/sapphire-paratime`][s-p-github] library will automatically
encrypt the eth_call, eth_estimateGas and eth_signTransaction JSON-RPC calls.

### Usage

Install the library via your favorite package manager

```shell npm2yarn
npm install -D @oasisprotocol/sapphire-paratime
```

After installing this library, find your Ethereum provider and wrap it using
wrapEthereumProvider.

```js
import { wrapEthereumProvider } from '@oasisprotocol/sapphire-paratime';

const provider = wrapEthereumProvider(window.ethereum);
```

:::info Example: Hardhat boilerplate

Our maintained Hardhat boilerplate uses the Sapphire TypeScript wrapper to
enable confidential transactions in development. Find the code in the
[Sapphire ParaTime examples] repository.

:::

[Sapphire ParaTime examples]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/examples/hardhat-boilerplate
