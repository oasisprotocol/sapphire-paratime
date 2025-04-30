import { sapphire, sapphireTestnet } from "wagmi/chains";
import {
	sapphireLocalnet,
	createSapphireConfig,
} from "@oasisprotocol/sapphire-wagmi-v2";
import { http } from "wagmi";

export const config = createSapphireConfig({
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
