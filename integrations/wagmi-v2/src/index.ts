/**
 * @license Apache-2.0
 */

import {
	type EIP2696_EthereumProvider,
	type SapphireWrapConfig,
	isWrappedEthereumProvider,
	wrapEthereumProvider,
} from "@oasisprotocol/sapphire-paratime";
import { sapphireLocalnet } from "@oasisprotocol/sapphire-viem-v2";
import { type InjectedParameters, injected } from "@wagmi/core";
import type { EIP1193Provider } from "viem";
import { sapphire, sapphireTestnet } from "wagmi/chains";

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
 *    import { injectedWithSapphire } from '@oasisprotocol/sapphire-wagmi-v2';
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
		target: () => {
			return {
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
			};
		},
	} as InjectedParameters);
}

interface BaseConnector {
	getProvider?(): Promise<unknown> | unknown;
	name?: string;
	id?: string;
}

type ConnectorFactoryReturn<C extends BaseConnector = BaseConnector> = C;

const SAPPHIRE_CHAIN_IDS = [
	sapphire.id,
	sapphireTestnet.id,
	sapphireLocalnet.id,
];

/**
 * Wrap any Wagmi connector with the Sapphire encryption layer.
 * Used to provide encrypted transactions and calldata to any connector type (WalletConnect, MetaMask, etc.).
 *
 * ```typescript
 * import { wrapConnectorWithSapphire } from '@oasisprotocol/sapphire-wagmi-v2';
 * import { walletConnect } from '@wagmi/connectors';
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

				const chainId = await (provider as EIP1193Provider)?.request({
					method: "eth_chainId",
				});
				const currentChainId = Number.parseInt(chainId, 16);

				if (!SAPPHIRE_CHAIN_IDS.includes(currentChainId)) {
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
