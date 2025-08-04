import { sapphire, sapphireTestnet } from "wagmi/chains";
import {
	sapphireLocalnet,
	wrapConnectorWithSapphire,
} from "@oasisprotocol/sapphire-wagmi-v2";
import { createConfig, http } from "wagmi";
import { metaMask, walletConnect } from "wagmi/connectors";

const { VITE_WALLET_CONNECT_PROJECT_ID } = import.meta.env;

export const config = createConfig({
	connectors: [
		wrapConnectorWithSapphire(metaMask(), {
			id: "metamask-sapphire",
			name: "MetaMask (Sapphire)",
		}),
		wrapConnectorWithSapphire(
			walletConnect({
				projectId: VITE_WALLET_CONNECT_PROJECT_ID,
			}),
			{
				id: "walletConnect-sapphire",
				name: "WalletConnect (Sapphire)",
			},
		),
	],
	chains: [sapphire, sapphireTestnet, sapphireLocalnet],
	transports: {
		[sapphire.id]: http(),
		[sapphireTestnet.id]: http(),
		[sapphireLocalnet.id]: http(),
	},
});

declare module "wagmi" {
	interface Register {
		config: typeof config;
	}
}
