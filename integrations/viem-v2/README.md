# Sapphire-Viem

[![version][viem-version]][viem-npm]
[![size][viem-size]][viem-bundlephobia]
![downloads][viem-downloads]

[viem-npm]: https://www.npmjs.org/package/@oasisprotocol/sapphire-viem-v2
[viem-version]: https://img.shields.io/npm/v/@oasisprotocol/sapphire-viem-v2
[viem-size]: https://img.shields.io/bundlephobia/minzip/@oasisprotocol/sapphire-viem-v2
[viem-bundlephobia]: https://bundlephobia.com/package/@oasisprotocol/sapphire-viem-v2
[viem-downloads]: https://img.shields.io/npm/dm/@oasisprotocol/sapphire-viem-v2.svg

A plugin for [Viem] 2.x that encrypts transactions, gas estimations and calls to
the Oasis Sapphire network to enable end-to-end encryption between the dApp and
smart contracts. It provides three functions which can be used together or
separately, see the guides below for usage instructions:

 * `sapphireHttpTransport` - [Transport] that intercepts & encrypts requests.
 * `wrapWalletClient` - Wraps a [WalletClient], to provide encryption.
 * `createSapphireSerializer` - [Transaction serializer], that encrypts calldata.

[Viem]: https://viem.sh/
[WalletClient]: https://viem.sh/docs/clients/wallet.html
[Transaction serializer]: https://viem.sh/docs/chains/serializers#api
[Transport]: https://viem.sh/docs/clients/transports/http

## Usage

Add the package to your project:

```
npm install @oasisprotocol/sapphire-viem-v2 viem@2.x
```

For local testing the chain configuration for `sapphireLocalnet` is available
in the `@oasisprotocol/sapphire-viem-v2` package installed above. The Sapphire
`mainnet` and `testnet` configurations are available in `viem/chains`:

```ts
import { sapphireLocalnet } from '@oasisprotocol/sapphire-viem-v2';
import { sapphire, sapphireTestnet } from 'viem/chains';
```

## Encryption

Use the `sapphireHttpTransport()` transport to automatically intercept and
encrypt the calldata provided to the `eth_estimateGas`, `eth_call` and
`eth_sendTransaction` JSON-RPC calls.

Transaction calldata will be encrypted while using the in-browser wallet
provider (`window.ethereum`) because this uses the `eth_sendTransaction`
JSON-RPC call to sign transactions.

> [!IMPORTANT]
> To encrypt transactions when using a local wallet client you must not only
> provide the `transport` parameter, but must also wrap the wallet client.

This example creates local wallet that is then wrapped with `wrapWalletClient`
which replaces the transaction serializer with one which performs Sapphire
encryption:

```typescript
import { createWalletClient } from 'viem'
import { english, generateMnemonic, mnemonicToAccount } from 'viem/accounts';
import { sapphireLocalnet, sapphireHttpTransport, wrapWalletClient } from '@oasisprotocol/sapphire-viem-v2';

const account = mnemonicToAccount(generateMnemonic(english));

const walletClient = await wrapWalletClient(createWalletClient({
	account,
	chain: sapphireLocalnet,
	transport: sapphireHttpTransport()
}));
```

Be careful to verify that any transactions which contain sensitive information
are encrypted by checking the Oasis block explorer and looking for the green
lock icon.

You can find more example code demonstrating how to use the library in our
[Hardhat-Viem example][example].

[example]: https://github.com/oasisprotocol/sapphire-paratime/blob/main/examples/hardhat-viem
