import { sapphire, sapphireTestnet } from "wagmi/chains";
import {
	wrapConnectorWithSapphire,
	sapphireHttpTransport,
	sapphireLocalnet,
} from "@oasisprotocol/sapphire-wagmi-v2";
import { createConfig, http } from "wagmi";
import { metaMask } from "wagmi/connectors";

const hardhatLocalChain = {
	id: 31337,
	name: "Hardhat",
	nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
	rpcUrls: {
		default: {
			http: [import.meta.env.VITE_HARDHAT_RPC_URL ?? "http://127.0.0.1:9545"],
		},
	},
} as const;

const sapphireMetamask = () => {
	return wrapConnectorWithSapphire(metaMask(), {
		id: "metamask-sapphire",
		name: "MetaMask (Sapphire)",
	}) as unknown as ReturnType<typeof metaMask>;
};

export const wagmiConfig = createConfig({
	chains: [sapphire, sapphireTestnet, sapphireLocalnet, hardhatLocalChain],
	connectors: [
		// Sapphire-wrapped aware MetaMask for Sapphire chains, unwrapped for other chains
		sapphireMetamask(),
	],
	transports: {
		[sapphire.id]: sapphireHttpTransport(),
		[sapphireTestnet.id]: sapphireHttpTransport(),
		[sapphireLocalnet.id]: sapphireHttpTransport(),
		[hardhatLocalChain.id]: http(),
	},
	multiInjectedProviderDiscovery: false,
});
