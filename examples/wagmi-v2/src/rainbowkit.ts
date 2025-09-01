import { Chain, sapphire, sapphireTestnet } from "wagmi/chains";
import {
	sapphireLocalnet,
	wrapConnectorWithSapphire,
} from "@oasisprotocol/sapphire-wagmi-v2";
import { createConfig, createConnector, http } from "wagmi";
import {
	connectorsForWallets,
	RainbowKitWalletConnectParameters,
	Wallet,
} from "@rainbow-me/rainbowkit";
import { metaMaskWallet } from "@rainbow-me/rainbowkit/wallets";
import { walletConnect } from "wagmi/connectors";

const { VITE_WALLET_CONNECT_PROJECT_ID } = import.meta.env;

interface ConnectorsForWalletsParameters {
	projectId: string;
	appName: string;
	appDescription?: string;
	appUrl?: string;
	appIcon?: string;
	walletConnectParameters?: RainbowKitWalletConnectParameters;
}

const wrapRainbowKitWalletWithSapphire = (
	wallet: Wallet,
	options: { id: string; name: string },
): Wallet => ({
	...wallet,
	id: options.id,
	name: options.name,
	createConnector: (walletDetails) => {
		const originalConnector = wallet.createConnector(walletDetails);
		return createConnector((config) => {
			const baseConnector = originalConnector(config);
			const wrappedConnector = wrapConnectorWithSapphire((_) => baseConnector, options);
			return wrappedConnector(config);
		});
	},
});

const wrappedMetaMaskWallet = ({
	projectId,
}: ConnectorsForWalletsParameters): Wallet =>
	wrapRainbowKitWalletWithSapphire(metaMaskWallet({ projectId }), {
		id: "metamask-sapphire",
		name: "MetaMask (Sapphire)",
	});

// https://github.com/rainbow-me/rainbowkit/blob/main/packages/rainbowkit/src/wallets/walletConnectors/walletConnectWallet/walletConnectWallet.svg
const walletConnectIconUrl =
	"data:image/svg+xml,%3Csvg%20width%3D%2228%22%20height%3D%2228%22%20viewBox%3D%220%200%2028%2028%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Crect%20width%3D%2228%22%20height%3D%2228%22%20fill%3D%22%233B99FC%22%2F%3E%0A%3Cpath%20d%3D%22M8.38969%2010.3739C11.4882%207.27538%2016.5118%207.27538%2019.6103%2010.3739L19.9832%2010.7468C20.1382%2010.9017%2020.1382%2011.1529%2019.9832%2011.3078L18.7076%2012.5835C18.6301%2012.6609%2018.5045%2012.6609%2018.4271%2012.5835L17.9139%2012.0703C15.7523%209.9087%2012.2477%209.9087%2010.0861%2012.0703L9.53655%2012.6198C9.45909%2012.6973%209.3335%2012.6973%209.25604%2012.6198L7.98039%2011.3442C7.82547%2011.1893%207.82547%2010.9381%207.98039%2010.7832L8.38969%2010.3739ZM22.2485%2013.012L23.3838%2014.1474C23.5387%2014.3023%2023.5387%2014.5535%2023.3838%2014.7084L18.2645%2019.8277C18.1096%2019.9827%2017.8584%2019.9827%2017.7035%2019.8277C17.7035%2019.8277%2017.7035%2019.8277%2017.7035%2019.8277L14.0702%2016.1944C14.0314%2016.1557%2013.9686%2016.1557%2013.9299%2016.1944C13.9299%2016.1944%2013.9299%2016.1944%2013.9299%2016.1944L10.2966%2019.8277C10.1417%2019.9827%209.89053%2019.9827%209.73561%2019.8278C9.7356%2019.8278%209.7356%2019.8277%209.7356%2019.8277L4.61619%2014.7083C4.46127%2014.5534%204.46127%2014.3022%204.61619%2014.1473L5.75152%2013.012C5.90645%2012.857%206.15763%2012.857%206.31255%2013.012L9.94595%2016.6454C9.98468%2016.6841%2010.0475%2016.6841%2010.0862%2016.6454C10.0862%2016.6454%2010.0862%2016.6454%2010.0862%2016.6454L13.7194%2013.012C13.8743%2012.857%2014.1255%2012.857%2014.2805%2013.012C14.2805%2013.012%2014.2805%2013.012%2014.2805%2013.012L17.9139%2016.6454C17.9526%2016.6841%2018.0154%2016.6841%2018.0541%2016.6454L21.6874%2013.012C21.8424%2012.8571%2022.0936%2012.8571%2022.2485%2013.012Z%22%20fill%3D%22white%22%2F%3E%0A%3C%2Fsvg%3E%0A";

const wrappedWalletConnectWallet = ({
	projectId,
	...options
}: ConnectorsForWalletsParameters): Wallet => ({
	id: "walletConnect-sapphire",
	name: "WalletConnect (Sapphire)",
	iconUrl: walletConnectIconUrl,
	iconBackground: "#3b99fc",
	qrCode: {
		getUri: (uri: string) => uri,
	},
	installed: void 0,
	createConnector: (walletDetails: any) =>
		createConnector((config) => {
			const wrappedConnector = wrapConnectorWithSapphire(
				walletConnect({
					projectId,
					showQrModal: false,
				}),
				{
					id: "walletConnect-sapphire",
					name: "WalletConnect (Sapphire)",
				},
			);

			return {
				...wrappedConnector(config),
				...walletDetails,
				...options,
				rkDetailsShowQrModal: walletDetails.rkDetails?.showQrModal,
				rkDetailsIsWalletConnectModalConnector:
					walletDetails.rkDetails?.isWalletConnectModalConnector,
			};
		}),
});

const connectors = connectorsForWallets(
	[
		{
			groupName: "Recommended",
			wallets: [wrappedMetaMaskWallet, wrappedWalletConnectWallet],
		},
	],
	{
		appName: "Wagmi v2 Example",
		projectId: VITE_WALLET_CONNECT_PROJECT_ID,
	},
);

export const rainbowKitConfig = createConfig({
	chains: [sapphire, sapphireTestnet, sapphireLocalnet] as [Chain, ...Chain[]],
	transports: {
		[sapphire.id]: http(),
		[sapphireTestnet.id]: http(),
		[sapphireLocalnet.id]: http(),
	},
	connectors,
});
