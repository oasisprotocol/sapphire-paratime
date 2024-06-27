# Sapphire + [Ethers.js v6]
[Ethers.js v6]: https://docs.ethers.org/v6/

[![version][ethers-v6-version]][ethers-v6-npm]
[![size][ethers-v6-size]][ethers-v6-bundlephobia]
![downloads][ethers-v6-downloads]

Integrate your Ethereum-based applications with the privacy features of Oasis
Sapphire when using the Ethers.js library (version 6). This README provides a
guide on how to get started with the `@oasisprotocol/sapphire-ethers-v6` package.

It may be necessary to use this package to enable automatic end-to-end
encryption between the application and the smart contracts deployed on Sapphire.
It does this by exporting two useful functions:

 * `wrapEthersProvider` - encrypts `eth_call` and `eth_estimateGas`
 * `wrapEthersSigner` - encrypts `eth_signTransaction` + [Wallet] signing

Many browser-based dApps can use the lightweight `@oasisprotocol/sapphire-paratime`
package if they rely entirely on the injected EIP-1193 wallet provider to
communicate with and sign transactions on Sapphire. However, server-side apps,
test suites and dApps using account abstraction (or those which directly use a
Wallet) will need to use this Ethers v6 integration package.

[Wallet]: https://docs.ethers.org/v6/api/wallet/
[ethers-v6-npm]: https://www.npmjs.com/package/@oasisprotocol/sapphire-ethers-v6
[ethers-v6-version]: https://img.shields.io/npm/v/@oasisprotocol/sapphire-ethers-v6
[ethers-v6-size]: https://img.shields.io/bundlephobia/minzip/@oasisprotocol/sapphire-ethers-v6
[ethers-v6-bundlephobia]: https://bundlephobia.com/package/@oasisprotocol/sapphire-ethers-v6
[ethers-v6-downloads]: https://img.shields.io/npm/dm/@oasisprotocol/sapphire-ethers-v6.svg


## Prerequisites

- Node.js (version 18.x or higher)
- An active internet connection, or the `sapphire-localnet` docker container.
- Optionally, an [EIP-1193] compatible Ethereum wallet provider (e.g. [MetaMask], [Rabby])

[EIP-1193]: https://eips.ethereum.org/EIPS/eip-1193
[MetaMask]: https://metamask.io/
[Rabby]: https://rabby.io/

## Usage

Add the Sapphire Ethers.js wrapper to your project:

```
pnpm add 'ethers@6.x' '@oasisprotocol/sapphire-ethers-v6'
```

### In the Browser

To use Oasis Sapphire with Ethers.js in a browser environment:

```typescript
import { BrowserProvider } from 'ethers';
import { wrapEthersSigner } from '@oasisprotocol/sapphire-ethers-v6';

const signer = wrapEthersSigner(
  new BrowserProvider(window.ethereum).getSigner()
);
```

### In Node.js

```typescript
import { getDefaultProvider, Wallet } from 'ethers';
import { NETWORKS, wrapEthersSigner } from '@oasisprotocol/sapphire-ethers-v6';

const defaultProvider = getDefaultProvider(NETWORKS.testnet.defaultGateway);
const signer = wrapEthersSigner(new Wallet('YOUR_PRIVATE_KEY').connect(defaultProvider));
```

### Using Just a Provider

Where no transactions require signing the Sapphire wrapper can be used with a [Provider], this will transparently encrypt both gas estimates and view calls (queries).

[Provider]: https://docs.ethers.org/v6/api/providers/

```typescript
import { getDefaultProvider } from 'ethers';
import { NETWORKS, wrapEthersProvider } from '@oasisprotocol/sapphire-ethers-v6';

const defaultProvider = getDefaultProvider(NETWORKS.testnet.defaultGateway);
const provider = wrapEthersProvider(defaultProvider);
```
