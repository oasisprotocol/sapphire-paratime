# @oasisprotocol/sapphire-viem-v2

A plugin for [Viem] 2.x that encrypts transactions, gas estimations and calls to
the Oasis Sapphire network to enable end-to-end encryption between the dApp and
smart contracts.

[Viem]: https://viem.sh/

## Usage

First install the package.

```
npm install @oasisprotocol/sapphire-viem-v2 viem@2.x
```

Next you must ensure that any clients use the `sapphireTransport()` to encrypt
any unsigned communication, for example when using [hardhat-viem] pass the
`transport` parameter when constructing a Public Client:

[hardhat-viem]: https://hardhat.org/hardhat-runner/docs/advanced/using-viem

```typescript
import { sapphireLocalnet, sapphireTransport } from '@oasisprotocol/sapphire-viem-v2';

const publicClient = await hre.viem.getPublicClient({
	chain: sapphireLocalnet,
	transport: sapphireTransport()
});
```

The Sapphire transport will only encrypt transactions if connected to an
in-browser wallet provider which accepts `eth_sendTransaction` calls. To encrypt
transactions when using a local wallet client you must not only provide the
`transport` parameter, but must also wrap the wallet client, as such:

```typescript
import { sapphireLocalnet, sapphireTransport, wrapWalletClient } from '@oasisprotocol/sapphire-viem-v2';

const walletClient = await wrapWalletClient(createWalletClient({
	account,
	chain: sapphireLocalnet,
	transport: sapphireTransport()
}));
```

### Chains

The chain configuration for `sapphireLocalnet` is available in the `@oasisprotocol/sapphire-viem-v2` package as seen above.
The Sapphire `mainnet` and `testnet` configurations are available in `viem/chains`
```ts
import { sapphire, sapphireTestnet } from 'viem/chains';
```
