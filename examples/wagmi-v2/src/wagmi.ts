import { createConfig } from "wagmi";
import { sapphire, sapphireTestnet } from "wagmi/chains";
import {
	injectedWithSapphire,
	sapphireHttpTransport,
	sapphireLocalnet,
} from "@oasisprotocol/sapphire-wagmi-v2";

export const config = createConfig({
	multiInjectedProviderDiscovery: false,
	chains: [sapphire, sapphireTestnet, sapphireLocalnet],
	connectors: [injectedWithSapphire()],
	transports: {
		[sapphire.id]: sapphireHttpTransport(),
		[sapphireTestnet.id]: sapphireHttpTransport(),
		[sapphireLocalnet.id]: sapphireHttpTransport(),
	},
});

declare module "wagmi" {
	interface Register {
		config: typeof config;
	}
}
