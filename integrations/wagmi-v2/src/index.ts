/**
 * @license Apache-2.0
 */

import {
	type SapphireWrapConfig,
	isWrappedEthereumProvider,
	wrapEthereumProvider,
} from "@oasisprotocol/sapphire-paratime";
import {
	type Config,
	type CreateConfigParameters,
	type CreateConnectorFn,
	type InjectedParameters,
	type Transport,
	createConfig,
	injected,
} from "@wagmi/core";
import type { Chain, EIP1193Provider } from "viem";
import {
	EIP6963_ANNOUNCE_PROVIDER_EVENT_NAME,
	SUPPORTED_RDNS,
} from "./constants.js";
import type {
	CreateSapphireConfigParameters,
	EIP6963AnnounceProviderEvent,
	EIP6963ProviderDetail,
	Rdns,
} from "./types.js";

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

/**
 * Creates a wagmi configuration with wrapped EIP-6963 Sapphire encryption layer.
 *
 * In case you are only using Sapphire chain:
 *
 * ```typescript
 * import { createSapphireConfig } from '@oasisprotocol/sapphire-wagmi-v2';
 *
 * export const config = createSapphireConfig({
 *   sapphireConfig: {
 *     replaceProviders: true,
 *   }
 *   ...
 * });
 * ```
 *
 * In case your dApp is multichain, the below example will create duplicate connectors for Sapphire:
 *
 * ```typescript
 * import { createSapphireConfig } from '@oasisprotocol/sapphire-wagmi-v2';
 *
 * export const config = createSapphireConfig({
 *   sapphireConfig: {
 *     replaceProviders: false,
 *     // Define which providers you want to wrap via RDNS
 *     wrappedProvidersFilter: (rdns) => ['io.metamask'].includes(rdns)
 *   }
 *   ...
 * });
 * ```
 *
 * @param {CreateConfigParameters<chains, transports, connectorFns> & CreateSapphireConfigParameters} parameters - Extended wagmi parameters,
 * with sapphireConfig
 * @return {Config<chains, transports, connectorFns>} Wagmi config
 */
export function createSapphireConfig<
	chains extends readonly [Chain, ...Chain[]],
	transports extends Record<chains[number]["id"], Transport>,
	connectorFns extends readonly CreateConnectorFn[],
>(
	parameters: CreateConfigParameters<chains, transports, connectorFns> &
		CreateSapphireConfigParameters,
): Config<chains, transports, connectorFns> {
	const { sapphireConfig, ...restParameters } = parameters;
	const { replaceProviders = false, wrappedProvidersFilter = () => true } =
		sapphireConfig;

	const _addEventListener = EventTarget.prototype.addEventListener;
	Object.defineProperty(EventTarget.prototype, "addEventListener", {
		value: function (
			type: string,
			callback: EventListenerOrEventListenerObject | null,
			options?: AddEventListenerOptions | boolean,
		): void {
			if (type === EIP6963_ANNOUNCE_PROVIDER_EVENT_NAME) {
				_addEventListener.call(
					this,
					type,
					(event: Event) => {
						let patchCustomEvent = null;

						if (
							SUPPORTED_RDNS.includes(
								(event as EIP6963AnnounceProviderEvent).detail.info.rdns,
							)
						) {
							const announceProviderEvent =
								event as EIP6963AnnounceProviderEvent;

							if (replaceProviders) {
								if (
									!isWrappedEthereumProvider(
										announceProviderEvent.detail.provider,
									)
								) {
									patchCustomEvent = new CustomEvent(
										EIP6963_ANNOUNCE_PROVIDER_EVENT_NAME,
										{
											detail: {
												...announceProviderEvent.detail,
												provider: wrapEthereumProvider(
													announceProviderEvent.detail.provider,
												),
											},
										},
									);
								}
							} else if (
								wrappedProvidersFilter(
									announceProviderEvent.detail.info.rdns,
								) &&
								!isWrappedEthereumProvider(
									announceProviderEvent.detail.provider,
								)
							) {
								const {
									info: { name, rdns, icon, uuid },
									provider,
								} = announceProviderEvent.detail;

								const dispatchAnnounceProviderEvent: CustomEvent<EIP6963ProviderDetail> =
									new CustomEvent(EIP6963_ANNOUNCE_PROVIDER_EVENT_NAME, {
										detail: Object.freeze({
											info: {
												uuid: `sapphire.${uuid}`,
												rdns: `sapphire.${rdns}` as Rdns,
												name: `${name} (Sapphire)`,
												icon,
											},
											provider: wrapEthereumProvider(provider),
										}),
									});

								window.dispatchEvent(dispatchAnnounceProviderEvent);
							}
						}

						return typeof callback === "function"
							? callback(patchCustomEvent ?? event)
							: callback?.handleEvent(patchCustomEvent ?? event);
					},
					options,
				);
			} else {
				_addEventListener.call(this, type, callback, options);
			}
		},
	});

	return createConfig<chains, transports, connectorFns>({
		...restParameters,
	});
}
