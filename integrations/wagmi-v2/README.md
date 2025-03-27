# Sapphire-Wagmi

[![version][wagmi-version]][wagmi-npm]
[![size][wagmi-size]][wagmi-bundlephobia]
![downloads][wagmi-downloads]

[wagmi-npm]: https://www.npmjs.org/package/@oasisprotocol/sapphire-wagmi-v2
[wagmi-version]: https://img.shields.io/npm/v/@oasisprotocol/sapphire-wagmi-v2
[wagmi-size]: https://img.shields.io/bundlephobia/minzip/@oasisprotocol/sapphire-wagmi-v2
[wagmi-bundlephobia]: https://bundlephobia.com/package/@oasisprotocol/sapphire-wagmi-v2
[wagmi-downloads]: https://img.shields.io/npm/dm/@oasisprotocol/sapphire-wagmi-v2.svg

A plugin for [Wagmi][wagmi] v2 that wraps the providers connected to the
Sapphire network to enable end-to-end encryption for transactions, view calls
and gas estimations.

[wagmi]: https://wagmi.sh/

## Usage

### Installation

First install the package and its dependencies.

```
npm install @oasisprotocol/sapphire-wagmi-v2 wagmi@2.x viem@2.x
```

### [EIP-6963] Multi Injected Provider Discovery

#### Single chain - Sapphire

When your application connects exclusively to Sapphire networks, the most 
straightforward approach is to set `sapphireConfig.replaceProviders = true`. 
This configuration ensures that all EIP-6963 providers are automatically wrapped 
with end-to-end encryption upon registration.

```typescript
import { http } from "wagmi";
import { sapphire, sapphireTestnet } from "wagmi/chains";
import {
  sapphireLocalnet,
  createSapphireConfig,
} from "@oasisprotocol/sapphire-wagmi-v2";

export const wagmiConfig = createSapphireConfig({
  sapphireConfig: {
    replaceProviders: true,
  },
  chains: [sapphire, sapphireTestnet, sapphireLocalnet],
  transports: {
    [sapphire.id]: http(),
    [sapphireTestnet.id]: http(),
    [sapphireLocalnet.id]: http(),
  },
});
```

#### Multichain

For multichain applications, you must manage which providers use end-to-end
encryption. It's essential to avoid using encrypted connectors for non-Sapphire
chains, and conversely, to ensure Sapphire chains use the appropriate encrypted
connectors.

```typescript
import { http } from "wagmi";
import { sapphire, sapphireTestnet } from "wagmi/chains";
import {
  sapphireLocalnet,
  createSapphireConfig,
} from "@oasisprotocol/sapphire-wagmi-v2";

export const wagmiConfig = createSapphireConfig({
  sapphireConfig: {
    replaceProviders: false,
    // Define which providers you want to wrap via RDNS
    wrappedProvidersFilter: (rdns) => ['io.metamask'].includes(rdns)
  },
  chains: [sapphire, sapphireTestnet, sapphireLocalnet],
  transports: {
    [sapphire.id]: http(),
    [sapphireTestnet.id]: http(),
    [sapphireLocalnet.id]: http(),
  },
});
```

The configuration above creates duplicate connectors with the naming convention 
`sapphire.${rdns}` for each selected provider. For example, in an application 
supporting both Ethereum and Sapphire networks, you would use the 
`sapphire.io.metamask` connector specifically for Sapphire chains and the 
standard `io.metamask` connector for Ethereum chain.

[EIP-6963]: https://eips.ethereum.org/EIPS/eip-6963

### [EIP-1193] Injected provider

In your Wagmi config definition, wrap the injected provider for Sapphire using 
`injectedWithSapphire()`, then define the transports using the
`sapphireHttpTransport()` function.

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

For a complete example of how to use this library, please refer to our
[Wagmi example][example].

[example]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/examples/wagmi-v2
