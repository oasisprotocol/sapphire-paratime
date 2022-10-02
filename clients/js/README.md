# Sapphire ParaTime Compat Lib

[@oasisprotocol/sapphire-paratime] makes it easy to port your dapp to the [Sapphire ParaTime]
by wrapping your existing `ethers.Provider`/`window.ethereum`/`web3.providers.*`.
Once you wrap your provider, you can use Sapphire just like you would use Ethereum.

[@oasisprotocol/sapphire-paratime]: https://www.npmjs.com/package/@oasisprotocol/sapphire-paratime
[sapphire paratime]: https://docs.oasis.dev/general/developer-resources/sapphire-paratime/

_If your dapp doesn't port in under 10 minutes, it's a bug!_  
If you have more than a little trouble, please file an issue.  
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

### web3.js

```ts
import Web3 from 'web3';
import * as sapphire from '@oasisprotocol/sapphire-paratime';

web3.setProvider(sapphire.wrap(web3.currentProvider));
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

## See Also

- [Oasis Testnet Faucet](https://faucet.testnet.oasis.dev/)
- [Creating dapps for Sapphire](https://docs.oasis.io/dapp/sapphire/quickstart)
- [How to Transfer ROSE into an EVM ParaTime](https://docs.oasis.io/general/manage-tokens/how-to-transfer-rose-into-paratime/)
