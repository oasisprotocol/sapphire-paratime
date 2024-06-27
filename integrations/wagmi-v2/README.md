# @oasisprotocol/sapphire-wagmi-v2

A plugin for Wagmi v2 that wraps the providers connected to the Sapphire network to enable end-to-end encryption for transactions, view calls and gas
estimations

## Usage

First install the package.

```
npm install @oasisprotocol/sapphire-wagmi-v2 wagmi@2.x viem@2.x
```

Next, in your Wagmi config definition, setup Sapphire wrapping for the injected
provide using `injectedWithSapphire()` and then define the transports using the
`sapphireTransport()` function.

```typescript
import { createConfig } from "wagmi";
import { sapphire, sapphireTestnet } from "wagmi/chains";
import {
	injectedWithSapphire,
	sapphireTransport,
} from "@oasisprotocol/sapphire-wagmi-v2";

export const config = createConfig({
	multiInjectedProviderDiscovery: false,
	chains: [sapphire, sapphireTestnet],
	connectors: [injectedWithSapphire()],
	transports: {
		[sapphire.id]: sapphireTransport(),
		[sapphireTestnet.id]: sapphireTransport()
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
