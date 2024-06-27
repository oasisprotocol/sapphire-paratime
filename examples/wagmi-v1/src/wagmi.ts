import { WindowProvider, createConfig } from "wagmi";
import { custom, createPublicClient, defineChain } from 'viem'
import { EIP2696_EthereumProvider, wrapEthereumProvider } from "@oasisprotocol/sapphire-paratime";
import { InjectedConnector } from "wagmi/connectors/injected";

declare global {
    interface Window {
		ethereum: EIP2696_EthereumProvider;
	}
}

export const sapphireLocalnet = defineChain({
	id: 0x5afd,
	name: 'Sapphire Localnet',
	nativeCurrency: {
		decimals: 18,
		name: 'TEST',
		symbol: 'TEST'
	},
	rpcUrls: {
		default: {
			http: ['http://localhost:8545']
		},
		public: {
			http: ['http://localhost:8545']
		}
	}
});

const cachedProviders:Map<object,WindowProvider> = new Map();

function getWrappedProvider (o:object) {
	if( cachedProviders.has(o) ) {
		return cachedProviders.get(o);
	}
	const p = wrapEthereumProvider(o as EIP2696_EthereumProvider) as unknown as WindowProvider;
	cachedProviders.set(o, p);
	return p;
}

export const config = createConfig({
	autoConnect: true,
	connectors: [
		new InjectedConnector({
			options: {
				name: 'Injected Provider',
				getProvider: () => getWrappedProvider(window.ethereum)
			}
		})
	],
	publicClient: createPublicClient({
		chain: sapphireLocalnet,
		transport: custom(wrapEthereumProvider(window.ethereum))
	})
});

declare module "wagmi" {
	interface Register {
		config: typeof config;
	}
}
