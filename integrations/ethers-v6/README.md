# Sapphire support for Ethers v6



## Example Usage

```ts
import { getDefaultProvider, BrowserProvider, Wallet } from 'ethers';
import { NETWORKS, wrapEthersSigner, wrapEthersSigner } from '@oasisprotocol/sapphire-ethers-v6';

// In the browser via `window.ethereum`.
const signer = wrapEthersSigner(
  new BrowserProvider(window.ethereum).getSigner(),
);

const defaultProvider = getDefaultProvider(NETWORKS.testnet.defaultGateway);

// In Node via `ethers.Wallet`.
const signer = wrapEthersSigner(new Wallet('0x0a5155afec0de...')
                                .connect(defaultProvider));

// Just a provider, no signer.
const provider = wrapEthersProvider(defaultProvider);
```
