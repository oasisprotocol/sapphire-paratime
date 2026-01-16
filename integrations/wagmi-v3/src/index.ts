/**
 * @license Apache-2.0
 */

import {
	type EIP2696_EthereumProvider,
	NETWORKS,
	type SapphireWrapConfig,
	isWrappedEthereumProvider,
	wrapEthereumProvider,
} from "@oasisprotocol/sapphire-paratime";
import type { EthereumProvider as WCEthereumProvider } from "@walletconnect/ethereum-provider";
import type { EIP1193Provider } from "viem";
import { type InjectedParameters, injected } from "wagmi/connectors";
type WalletConnectProvider = typeof WCEthereumProvider.prototype;

// Re-export chains and utilities from sapphire-viem-v2
// Includes: sapphire, sapphireTestnet, sapphireLocalnet, sapphireHttpTransport, etc.
export * from "@oasisprotocol/sapphire-viem-v2";

type Window = {
	ethereum?: EIP1193Provider;
};

const cachedProviders: Map<EIP1193Provider, EIP1193Provider> = new Map();

/**
 * Wrap the `window.ethereum` with the Sapphire encryption layer.
 * Used to provide encrypted transactions and calldata to Wagmi browser dApps.
 *
 * ```
 *    import { injectedWithSapphire } from '@oasisprotocol/sapphire-wagmi-v3';
 *
 *    export const config = createConfig({
 *      connectors: [
 *        injectedWithSapphire()
 *      ],
 *      ...
 *    });
 * ```
 *
 * @returns Same as injected()
 */
export function injectedWithSapphire(
	options?: SapphireWrapConfig,
): ReturnType<typeof injected> {
	return injected({
		target: (() => ({
			id: "injected-sapphire",
			name: "Injected (Sapphire)",
			provider(window?: Window) {
				if (window?.ethereum) {
					// Note: providers are cached as connectors are frequently retrieved
					//       it prevents sapphire wrapper being called multiple times
					//       which spams the RPC with oasis_callDataPublicKey requests
					if (!cachedProviders.has(window.ethereum)) {
						const wp = wrapEthereumProvider(
							window.ethereum as unknown as Parameters<
								typeof wrapEthereumProvider
							>[0],
							options,
						) as EIP1193Provider;
						cachedProviders.set(window.ethereum, wp);
						return wp;
					}
					return cachedProviders.get(window.ethereum);
				}
				return undefined;
			},
		})) as unknown as InjectedParameters["target"],
	});
}

interface BaseConnector {
	getProvider?(): Promise<unknown> | unknown;
	name?: string;
	id?: string;
}

type ConnectorFactoryReturn<C extends BaseConnector = BaseConnector> = C;

const SAPPHIRE_CHAIN_IDS = [
	NETWORKS.mainnet.chainId,
	NETWORKS.testnet.chainId,
	NETWORKS.localnet.chainId,
	NETWORKS.pontusXTestnet.chainId,
	NETWORKS.pontusXDevnet.chainId,
];

/**
 * Wrap any Wagmi connector with the Sapphire encryption layer.
 * Used to provide encrypted transactions and calldata to any connector type (WalletConnect, MetaMask, etc.).
 *
 * ```typescript
 * import { wrapConnectorWithSapphire } from '@oasisprotocol/sapphire-wagmi-v3';
 * import { walletConnect } from 'wagmi/connectors';
 *
 * export const config = createConfig({
 *   connectors: [
 *     wrapConnectorWithSapphire(
 *       walletConnect({ projectId: 'your-project-id' }),
 *       {
 *         id: 'walletconnect-sapphire',
 *         name: 'WalletConnect (Sapphire)',
 *       }
 *     )
 *   ],
 *   ...
 * });
 * ```
 *
 * @returns A wrapped connector factory that provides Sapphire encryption
 */
export function wrapConnectorWithSapphire<
	// biome-ignore lint/suspicious/noExplicitAny: Generic type parameter needs to accept any array type
	T extends any[],
	C extends BaseConnector = BaseConnector,
>(
	connectorFactory: (...args: T) => ConnectorFactoryReturn<C>,
	options?: {
		customWrapper?: <TConnector extends C>(connector: TConnector) => TConnector;
		sapphireWrapConfig?: SapphireWrapConfig;
		name?: string;
		id?: string;
	},
): (...args: T) => ConnectorFactoryReturn<C> {
	const cachedWrappedProviders: Map<
		EIP2696_EthereumProvider,
		EIP2696_EthereumProvider
	> = new Map();

	return (...args: T) => {
		const baseConnector = connectorFactory(...args);

		if (options?.name) {
			baseConnector.name = options.name;
		}
		if (options?.id) {
			baseConnector.id = options.id;
		}

		if (options?.customWrapper) {
			return options.customWrapper(baseConnector);
		}

		const originalGetProvider = baseConnector.getProvider?.bind(baseConnector);
		if (originalGetProvider) {
			baseConnector.getProvider = async () => {
				const provider = await originalGetProvider();

				if (!provider) {
					return provider;
				}

				let chainId = null;

				if ((provider as WalletConnectProvider).isWalletConnect) {
					if (!(provider as WalletConnectProvider).connected) {
						return provider;
					}
					chainId = (provider as WalletConnectProvider).chainId;
				} else {
					const chainIdResponse = await (provider as EIP1193Provider)?.request({
						method: "eth_chainId",
					});
					chainId = Number.parseInt(chainIdResponse as string, 16);
				}

				if (!SAPPHIRE_CHAIN_IDS.includes(chainId)) {
					return provider;
				}

				if (isWrappedEthereumProvider(provider as EIP2696_EthereumProvider)) {
					return provider;
				}

				if (!cachedWrappedProviders.has(provider as EIP2696_EthereumProvider)) {
					const wrappedProvider = wrapEthereumProvider(
						provider as EIP2696_EthereumProvider,
						options?.sapphireWrapConfig,
					);
					cachedWrappedProviders.set(
						provider as EIP2696_EthereumProvider,
						wrappedProvider,
					);
					return wrappedProvider;
				}

				return cachedWrappedProviders.get(provider as EIP2696_EthereumProvider);
			};
		}

		return baseConnector;
	};
}
