# Sapphire ParaTime Compat Lib

[@oasisprotocol/sapphire-paratime] makes it easy to port your dapp to the [Sapphire ParaTime]
by wrapping your existing `ethers.Provider`/`window.ethereum`/`web3.providers.*`.

[@oasisprotocol/sapphire-paratime]: https://www.npmjs.com/package/@oasisprotocol/sapphire-paratime
[sapphire paratime]: https://docs.oasis.dev/general/developer-resources/sapphire-paratime/

## Usage

In just a couple of lines of code, you can bring confidentiality to your dapp frontend.

**If your dapp doesn't port in under 10 minutes, you get your money back!**  
But seriously, if you have more than a little trouble, file a bug report.
There should be _no_ reason _not_ to use the Sapphire ParaTime!

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

## See Also

- [Oasis Testnet Faucet](https://faucet.testnet.oasis.dev/)
- [Creating dapps for Sapphire](https://docs.oasis.dev/general/developer-resources/sapphire-paratime/writing-dapps-on-sapphire)
- [How to Transfer ROSE into an EVM ParaTime](https://docs.oasis.dev/general/manage-tokens/how-to-transfer-rose-into-evm-paratime)
