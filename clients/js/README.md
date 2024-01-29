# Sapphire ParaTime Compat Lib

[@oasisprotocol/sapphire-paratime] makes it easy to port your dapp to the [Sapphire ParaTime]
by wrapping your existing `ethers.Provider`/`window.ethereum`.
Once you wrap your provider, you can use Sapphire just like you would use Ethereum.

[@oasisprotocol/sapphire-paratime]: https://www.npmjs.com/package/@oasisprotocol/sapphire-paratime
[sapphire paratime]: https://docs.oasis.io/dapp/sapphire/

_If your dapp doesn't port in under 10 minutes, it's a bug!_<br />
If you have more than a little trouble, please file an issue.<br />
There should be _no_ reason _not_ to use the Sapphire ParaTime!

## Usage

After installing this library, find your Ethereum provider and wrap it using `sapphire.wrap`.
Below are some examples for the most kinds of providers.

### Hardhat

Try the [@oasisprotocol/sapphire-hardhat] Hardhat plugin for extra convenience.
Place this line at the top of your `hardhat.config.ts`.

```js
import '@oasisprotocol/sapphire-hardhat';
// All other Hardhat plugins must come below.
```

[@oasisprotocol/sapphire-hardhat]: https://www.npmjs.com/package/@oasisprotocol/sapphire-hardhat

### ethers.js

```ts
import { ethers } from 'ethers';
import * as sapphire from '@oasisprotocol/sapphire-paratime';

// In the browser via `window.ethereum`.
const signer = sapphire.wrap(
  new ethers.providers.Web3Provider(window.ethereum).getSigner(),
);

// In Node via `ethers.Wallet`.
const signer = sapphire
  .wrap(new ethers.Wallet('0x0a5155afec0de...'))
  .connect(ethers.getDefaultProvider(sapphire.NETWORKS.testnet.defaultGateway));

// Just a provider, no signer.
const provider = sapphire.wrap(
  ethers.getDefaultProvider(sapphire.NETWORKS.testnet.defaultGateway),
);
```

### [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193)

```ts
import * as sapphire from '@oasisprotocol/sapphire-paratime';

const provider = sapphire.wrap(window.ethereum);
window.ethereum = sapphire.wrap(window.ethereum); // If you're feeling bold.
```

## Troubleshooting

### `Error: missing provider (operation="getChainId", code=UNSUPPORTED_OPERATION, ...)`

**Explanation:** When you first make a transaction or call using a wrapped signer or provider,
this library will automatically fetch the runtime public key from the Web3 gateway
using your connected provider. If you've wrapped just a signer (e.g., `ethers.Wallet`),
then you'll see this error.

**Fix:** The simplest thing to do is connect a provider. Alternatively, you can pass in
a pre-initialized `Cipher` object as the second argument to `wrap`; and then also generate
signed queries manually using the `overrides` parameter to `SignedCallDataPack.make`. This
latter approach is not recommended except for the most custom of use cases, however.

### MetaMask keeps popping up asking me to sign messages

**Explanation:** The default behavior of the Sapphire ParaTime compatibility library is to
sign calls such that `msg.sender` can be authenticated during `eth_call` and `eth_estimateGas`.
This is useful for methods in contracts that do identity-based access control. For better UX
in the browser, you should only make signed calls when necessary.

**Fix:** The Sapphire ParaTime compat lib will not sign calls when the `from` address is
`address(0)`. For Web3.js you can pass `{ from: `0x${'0'.repeat(40)}` }` as the final arg
to `Contract.method().call` ([ref](https://web3js.readthedocs.io/en/v1.2.11/web3-eth-contract.html)). For Ethers.js please read the next section.

### `Contract with a Signer cannot override from (operation="overrides.from", code=UNSUPPORTED_OPERATION, ...)`

**Explanation:** Ethers prevents overriding `from` when using a Signer [for safety reasons](https://github.com/ethers-io/ethers.js/discussions/3327).

**Fix:** Create a new `Contract` instance but do not connect it to a signer–just a provider.
Use that for unsigned queries instead.

## See Also

- [Oasis Testnet Faucet](https://faucet.testnet.oasis.dev/)
- [Creating dapps for Sapphire](https://docs.oasis.io/dapp/sapphire/quickstart)
- [How to Transfer ROSE into an EVM ParaTime](https://docs.oasis.io/general/manage-tokens/how-to-transfer-rose-into-paratime/)
