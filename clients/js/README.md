# Sapphire ParaTime Compat Lib

[@oasisprotocol/sapphire-paratime] makes it easy to port your dapp to the [Sapphire ParaTime]
by wrapping your existing EIP-1193 compatible provider (e.g. `window.ethereum`).
Once you wrap your provider, you can use Sapphire just like you would use
Ethereum, however to get full support for encrypted transactions, queries and
gas estimates it may be necessary to use a framework-specific package such as
with Ethers, Hardhat, Viem or Wagmi.

The Sapphire wrapper with automatically encrypt the `eth_call`, `eth_estimateGas`
and `eth_signTransaction` JSON-RPC calls

[@oasisprotocol/sapphire-paratime]: https://www.npmjs.com/package/@oasisprotocol/sapphire-paratime
[sapphire paratime]: https://docs.oasis.io/build/sapphire/

_If your dapp doesn't port in under 10 minutes, it's a bug!_<br />
If you have more than a little trouble, please file an issue.<br />
There should be _no_ reason _not_ to use the Sapphire ParaTime!

## Usage

After installing this library, find your Ethereum provider and wrap it using
`wrapEthereumProvider`. Below are some examples for the most kinds of providers.

### [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193)

```ts
import { wrapEthereumProvider } from '@oasisprotocol/sapphire-paratime';

const provider = wrapEthereumProvider(window.ethereum);
window.ethereum = wrapEthereumProvider(window.ethereum); // If you're feeling bold.
```

### Hardhat

Try the [@oasisprotocol/sapphire-hardhat] Hardhat plugin for extra convenience.
Place this line at the top of your `hardhat.config.ts`.

```js
import '@oasisprotocol/sapphire-hardhat';
// All other Hardhat plugins must come below.
```

[@oasisprotocol/sapphire-hardhat]: https://www.npmjs.com/package/@oasisprotocol/sapphire-hardhat

## Troubleshooting

### `Error: missing provider (operation="getChainId", code=UNSUPPORTED_OPERATION, ...)`

**Explanation:** When you first make a transaction or call using a wrapped signer or provider,
this library will automatically fetch the runtime public key from the Web3 gateway
using your connected provider. If you've wrapped just a signer (e.g., `ethers.Wallet`),
then you'll see this error.

**Fix:** The simplest thing to do is connect a provider. Alternatively, you can pass in
a pre-initialized `Cipher` object as the second argument to `wrap`; and then also generate
signed queries manually using the `overrides` parameter to `SignedCallDataPack.make`.

## See Also

- [Oasis Testnet Faucet](https://faucet.testnet.oasis.io/)
- [Creating dapps for Sapphire](https://docs.oasis.io/build/sapphire/quickstart)
- [How to Transfer ROSE into an EVM ParaTime](https://docs.oasis.io/general/manage-tokens/how-to-transfer-rose-into-paratime/)
