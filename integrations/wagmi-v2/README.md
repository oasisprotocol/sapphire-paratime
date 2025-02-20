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

First install the package.

```
npm install @oasisprotocol/sapphire-wagmi-v2 wagmi@2.x viem@2.x
```

Next, in your Wagmi config definition, setup Sapphire wrapping for the injected
provide using `injectedWithSapphire()` and then define the transports using the
`sapphireHttpTransport()` function.

```typescript
import { createConfig } from "wagmi";
import { sapphire, sapphireTestnet } from "wagmi/chains";
import {
	injectedWithSapphire,
	sapphireHttpTransport,
} from "@oasisprotocol/sapphire-wagmi-v2";

export const config = createConfig({
	multiInjectedProviderDiscovery: false,
	chains: [sapphire, sapphireTestnet],
	connectors: [injectedWithSapphire()],
	transports: {
		[sapphire.id]: sapphireHttpTransport(),
		[sapphireTestnet.id]: sapphireHttpTransport()
	},
});
```

Please note that while [EIP-6963] (Multi Injected Provider Discovery) is
supported by Wagmi it is only possible to wrap the default injected [EIP-1193]
compatible provider. For this reason you must disable MIPD support in the
Wagmi configuration as additional discovered providers will not be Sapphire
wrapped.

```typescript
    multiInjectedProviderDiscovery: false,
```

[EIP-6963]: https://eips.ethereum.org/EIPS/eip-6963
[EIP-1193]: https://eips.ethereum.org/EIPS/eip-1193

To connect to your `sapphire-localnet` instance, define a custom chain:

```typescript
import { defineChain } from "viem";

const sapphireLocalnet = defineChain({
	id: 0x5afd,
	name: "Oasis Sapphire Localnet",
	network: "sapphire-localnet",
	nativeCurrency: { name: "Sapphire Local Rose", symbol: "TEST", decimals: 18 },
	rpcUrls: {
		default: {
			http: ["http://localhost:8545"],
		},
	},
	testnet: true,
});
```

For a complete example of how to use this library, please refer to our
[Wagmi example][example].

[example]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/examples/wagmi-v2
