This is a [Vite](https://vitejs.dev) project bootstrapped with [create-wagmi].

[create-wagmi]: https://github.com/wevm/wagmi/tree/main/packages/create-wagmi

It uses the Sapphire wrapper to encrypt contract deployments, transactions,
view calls & gas estimations using the `injectedWithSapphire()` connector and
`sapphireTransport` adapter configured in `src/wagmi.ts`:

The connector and transport must be configured to use Sapphire to ensure
that both transactions and view calls are encrypted.

```typescript
import { injectedWithSapphire,
         sapphireTransport,
         sapphireLocalnet } from "@oasisprotocol/sapphire-wagmi-v2";

export const config = createConfig({
	multiInjectedProviderDiscovery: false,
	chains: [sapphire, sapphireTestnet, sapphireLocalnet],
	connectors: [injectedWithSapphire()],
	transports: {
		[sapphire.id]: sapphireTransport(),
		[sapphireTestnet.id]: sapphireTransport(),
		[sapphireLocalnet.id]: sapphireTransport(),
	},
});
```

Please note that `multiInjectedProviderDiscovery` is disabled, as [EIP-6963] is
not yet supported by the Sapphire Wagmi integration.

[EIP-6963]: https://eips.ethereum.org/EIPS/eip-6963
