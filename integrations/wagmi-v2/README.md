# Sapphire Wagmi v2

[![version][wagmi-version]][wagmi-npm]
[![size][wagmi-size]][wagmi-bundlephobia]
![downloads][wagmi-downloads]

[wagmi-npm]: https://www.npmjs.org/package/@oasisprotocol/sapphire-wagmi-v2
[wagmi-version]: https://img.shields.io/npm/v/@oasisprotocol/sapphire-wagmi-v2
[wagmi-size]: https://img.shields.io/bundlephobia/minzip/@oasisprotocol/sapphire-wagmi-v2
[wagmi-bundlephobia]: https://bundlephobia.com/package/@oasisprotocol/sapphire-wagmi-v2
[wagmi-downloads]: https://img.shields.io/npm/dm/@oasisprotocol/sapphire-wagmi-v2.svg

A plugin for [Wagmi][wagmi] v2 that provides seamless integration with the Oasis
Sapphire network, enabling end-to-end encryption for transactions and gas
estimations. This package wraps providers and connectors to
automatically encrypt data when interacting with Sapphire networks.

[wagmi]: https://wagmi.sh/

## Usage

### Installation

Install the package along with required peer dependencies:

```
npm install @oasisprotocol/sapphire-wagmi-v2 wagmi@2.x viem@2.x
```

### [EIP-6963] Multi Injected Provider Discovery

#### Single chain - Sapphire

The primary way to use this library is by wrapping existing Wagmi connectors
with [wrapConnectorWithSapphire()]. It is recommended to modify the connector
name to differentiate it from "unwrapped" connectors. This works with any
connector type (MetaMask, WalletConnect, Coinbase Wallet,
etc.):

```typescript
import { createConfig } from "wagmi";
import { sapphire, sapphireTestnet } from "wagmi/chains";
import { metaMask, walletConnect } from "@wagmi/connectors";
import {
  wrapConnectorWithSapphire,
  sapphireHttpTransport
} from "@oasisprotocol/sapphire-wagmi-v2";

export const wagmiConfig = createConfig({
  chains: [sapphire, sapphireTestnet],
  connectors: [
    wrapConnectorWithSapphire(
      metaMask,
      {
        id: 'metamask-sapphire',
        name: 'MetaMask (Sapphire)',
      }
    ),
    wrapConnectorWithSapphire(
      () => walletConnect({ projectId: 'your-project-id' }),
      {
        id: 'walletconnect-sapphire',
        name: 'WalletConnect (Sapphire)',
      }
    ),
  ],
  transports: {
    [sapphire.id]: sapphireHttpTransport(),
    [sapphireTestnet.id]: sapphireHttpTransport(),
    [sapphireLocalnet.id]: sapphireHttpTransport(),
  },
});
```

#### Multichain

For applications supporting both Sapphire and non-Sapphire networks,
`wrapConnectorWithSapphire` automatically detects the chain and only applies
encryption when connected to Sapphire networks. This allows you to use a single
wrapped connector for both Sapphire and non-Sapphire chains:

```typescript
import { createConfig } from "wagmi";
import { sapphire, mainnet } from "wagmi/chains";
import { metaMask } from "@wagmi/connectors";
import {
  wrapConnectorWithSapphire,
  sapphireHttpTransport,
  sapphireLocalnet
} from "@oasisprotocol/sapphire-wagmi-v2";
import { http } from "wagmi";

export const wagmiConfig = createConfig({
  chains: [sapphire, sapphireLocalnet, mainnet],
  connectors: [
    // Sapphire-wrapped aware MetaMask for Sapphire chains, unwrapped for other chains
    wrapConnectorWithSapphire(
      metaMask(),
      {
        id: 'metamask-sapphire',
        name: 'MetaMask (Sapphire)',
      }
    ),
  ],
  transports: {
    [sapphire.id]: sapphireHttpTransport(),
    [sapphireLocalnet.id]: sapphireHttpTransport(),
    [mainnet.id]: http(),
  },
});
```

[EIP-6963]: https://eips.ethereum.org/EIPS/eip-6963
[wrapConnectorWithSapphire()]: https://api.docs.oasis.io/js/sapphire-wagmi-v2/functions/wrapConnectorWithSapphire.html

### [EIP-1193] Injected provider

In your Wagmi config definition, wrap the injected provider for Sapphire
using [injectedWithSapphire()].

```typescript
import { createConfig } from "wagmi";
import { sapphire, sapphireTestnet } from "wagmi/chains";
import {
  injectedWithSapphire,
  sapphireHttpTransport,
  sapphireLocalnet
} from "@oasisprotocol/sapphire-wagmi-v2";

export const wagmiConfig = createConfig({
  multiInjectedProviderDiscovery: false,
  chains: [sapphire, sapphireTestnet, sapphireLocalnet],
  connectors: [injectedWithSapphire()],
  transports: {
    [sapphire.id]: sapphireHttpTransport(),
    [sapphireTestnet.id]: sapphireHttpTransport(),
    [sapphireLocalnet.id]: sapphireHttpTransport()
  },
});
```

[EIP-1193]: https://eips.ethereum.org/EIPS/eip-1193
[injectedWithSapphire()]: https://api.docs.oasis.io/js/sapphire-wagmi-v2/functions/injectedWithSapphire.html

### View-calls data encryption

Use a public client with [createPublicClient()] and for read-only operations
like querying blockchain data and calling view functions without requiring a
wallet. The Sapphire transport is still necessary even for read operations to
properly handle end-to-end encryption when accessing private contract state or
making view calls that return encrypted data.

```typescript
import {
  sapphireHttpTransport,
  wrapWalletClient,
  createSapphireSerializer,
  sapphireLocalnet
} from '@oasisprotocol/sapphire-wagmi-v2';
import { createWalletClient } from 'viem';

// Create a Sapphire-enabled HTTP transport
const transport = sapphireHttpTransport();

const client = await wrapWalletClient(
  createWalletClient({
    account,
    chain: sapphireLocalnet,
    transport: sapphireHttpTransport()
  })
);
```

For a complete example of how to use this library, please refer to our
[Wagmi example][example]. In case you want to integrate with a 3rd wallet
library, also see the [Wagmi example][example] for how to do so, as the example
for Rainbowkit is provided.

[example]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/examples/wagmi-v2
[createPublicClient()]: https://viem.sh/docs/clients/public
