import { createConfig } from "wagmi";
import { sapphire, sapphireTestnet } from "wagmi/chains";
import {
	injectedWithSapphire,
	sapphireTransport,
	sapphireLocalnet,
} from "@oasisprotocol/sapphire-wagmi-v2";

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

declare module "wagmi" {
	interface Register {
		config: typeof config;
	}
}
