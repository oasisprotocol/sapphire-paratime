import { Chain, sapphire, sapphireTestnet } from "wagmi/chains";
import {
  sapphireLocalnet,
  wrapConnectorWithSapphire,
  sapphireHttpTransport,
} from '@oasisprotocol/sapphire-wagmi-v2';
import { createConfig } from "wagmi";
import { connectorsForWallets, Wallet } from "@rainbow-me/rainbowkit";
import {
	metaMaskWallet,
	walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { isMetaMaskInjected, isMobileDevice } from "./util.ts";

const { VITE_WALLET_CONNECT_RAINBOWKIT_PROJECT_ID } = import.meta.env;

const wrapRainbowKitWalletWithSapphire =
	(
		walletFn: (options: { projectId: string }) => Wallet,
		sapphireOptions: { id: string; name: string },
	) =>
	(options: { projectId: string }): Wallet => {
		const wallet = walletFn(options);

		return {
			...wallet,
			id: sapphireOptions.id,
			name: sapphireOptions.name,
			createConnector: (walletDetails) => {
				const originalConnector = wallet.createConnector(walletDetails);
				return (config) => {
					const baseConnector = originalConnector(config);
					const wrappedConnector = wrapConnectorWithSapphire(
						(_) => baseConnector,
						sapphireOptions,
					);
					return wrappedConnector(config);
				};
			},
		};
	};

const createMetaMaskWalletConnectWallet = (options: {
	projectId: string;
}): Wallet => {
	const wallet = walletConnectWallet({
		...options,
		options: {
			metadata: {
				name: "MetaMask (Sapphire)",
				description: "Connect with MetaMask",
				url: window.location.origin,
				icons: [
					"https://raw.githubusercontent.com/MetaMask/brand-resources/master/SVG/metamask-fox.svg",
				],
			},
		},
	});

	return {
		...wallet,
		id: "metamask-wc-sapphire-rk",
		name: "MetaMask (Sapphire)",
		iconUrl:
			"https://raw.githubusercontent.com/rainbow-me/rainbowkit/refs/heads/main/packages/rainbowkit/src/wallets/walletConnectors/metaMaskWallet/metaMaskWallet.svg",
		iconBackground: "#f6851b",
		mobile: wallet.mobile || {
			getUri: (uri: string) => uri,
		},
		desktop: wallet.desktop || {
			getUri: (uri: string) => uri,
		},
		qrCode: wallet.qrCode || {
			getUri: (uri: string) => uri,
		},
	};
};

// MetaMask wallet that uses WalletConnect on mobile, native MetaMask on desktop
const createMetaMaskWallet = (options: { projectId: string }): Wallet => {
	const walletOptions = {
		id: "metamask-sapphire-rk",
		name: "MetaMask (Sapphire)",
	};

	if (isMobileDevice() && !isMetaMaskInjected()) {
		const baseWallet = createMetaMaskWalletConnectWallet(options);
		return {
			...baseWallet,
			id: walletOptions.id,
			name: walletOptions.name,
			createConnector: (walletDetails) => {
				const originalConnector = baseWallet.createConnector(walletDetails);
				return (config) => {
					const baseConnector = originalConnector(config);
					const wrappedConnector = wrapConnectorWithSapphire(
						(_) => baseConnector,
						walletOptions,
					);
					return wrappedConnector(config);
				};
			},
		};
	}

	return wrapRainbowKitWalletWithSapphire(
		metaMaskWallet,
		walletOptions,
	)(options);
};

const createWalletConnectWallet = (options: { projectId: string }): Wallet => {
	const walletOptions = {
		id: "walletConnect-sapphire-rk",
		name: "WalletConnect (Sapphire)",
	};
	const baseWallet = walletConnectWallet(options);

	return {
		...baseWallet,
		...walletOptions,
		mobile: baseWallet.mobile || {
			getUri: (uri: string) => uri,
		},
		desktop: baseWallet.desktop || {
			getUri: (uri: string) => uri,
		},
		qrCode: baseWallet.qrCode || {
			getUri: (uri: string) => uri,
		},
		createConnector: (walletDetails) => {
			const originalConnector = baseWallet.createConnector(walletDetails);
			return (config) => {
				const baseConnector = originalConnector(config);
				const wrappedConnector = wrapConnectorWithSapphire(
					(_) => baseConnector,
					walletOptions,
				);
				return wrappedConnector(config);
			};
		},
	};
};

const connectors = connectorsForWallets(
	[
		{
			groupName: "Recommended",
			wallets: [createMetaMaskWallet, createWalletConnectWallet],
		},
	],
	{
		appName: "Wagmi v2 Example",
		projectId: VITE_WALLET_CONNECT_RAINBOWKIT_PROJECT_ID,
	},
);

export const rainbowKitConfig = createConfig({
	chains: [sapphire, sapphireTestnet, sapphireLocalnet] as [Chain, ...Chain[]],
	transports: {
		[sapphire.id]: sapphireHttpTransport(),
		[sapphireTestnet.id]: sapphireHttpTransport(),
		[sapphireLocalnet.id]: sapphireHttpTransport(),
	},
	connectors,
	multiInjectedProviderDiscovery: false,
});
