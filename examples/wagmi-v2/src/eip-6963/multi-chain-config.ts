import { http } from "wagmi";
import { sapphire, sapphireTestnet } from "wagmi/chains";
import {
	sapphireLocalnet,
	createSapphireConfig,
} from "@oasisprotocol/sapphire-wagmi-v2";

export const config = createSapphireConfig({
	sapphireConfig: {
		replaceProviders: false,
		wrappedProvidersFilter: (rdns) => ["io.metamask"].includes(rdns),
	},
	chains: [sapphire, sapphireTestnet, sapphireLocalnet],
	transports: {
		[sapphire.id]: http(),
		[sapphireTestnet.id]: http(),
		[sapphireLocalnet.id]: http(),
	},
});
