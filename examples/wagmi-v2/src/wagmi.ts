import { sapphire, sapphireTestnet } from "wagmi/chains";
import {
	sapphireLocalnet,
	wrapConnectorWithSapphire,
} from "@oasisprotocol/sapphire-wagmi-v2";
import { createConfig, createConnector, http } from "wagmi";
import { metaMask, walletConnect } from "wagmi/connectors";
import { isMetaMaskInjected, isMobileDevice } from "./util.ts";

const { VITE_WALLET_CONNECT_PROJECT_ID } = import.meta.env;

// Use WalletConnect on mobile but display as "MetaMask", MetaMask on desktop
const getMetaMaskConnectorFactory = () => {
	if (isMobileDevice() && !isMetaMaskInjected()) {
		return createConnector((config) => {
			return walletConnect({
				projectId: VITE_WALLET_CONNECT_PROJECT_ID,
				metadata: {
					name: "MetaMask (Sapphire)",
					description: "Connect with MetaMask",
					url: window.location.origin,
					icons: [
						"https://raw.githubusercontent.com/MetaMask/brand-resources/master/SVG/metamask-fox.svg",
					],
				},
			})(config);
		});
	} else {
		return metaMask({
			headless: true,
			checkInstallationImmediately: false,
			enableAnalytics: false,
			preferDesktop: true,
		});
	}
};

export const config = createConfig({
	connectors: [
		wrapConnectorWithSapphire(
			getMetaMaskConnectorFactory() as ReturnType<typeof metaMask>,
			{
				id: "metamask-sapphire",
				name: "MetaMask (Sapphire)",
			},
		),
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
	multiInjectedProviderDiscovery: false,
});

declare module "wagmi" {
	interface Register {
		config: typeof config;
	}
}
