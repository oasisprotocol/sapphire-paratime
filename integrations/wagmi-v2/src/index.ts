// SPDX-License-Identifier: Apache-2.0

import { wrapEthereumProvider } from "@oasisprotocol/sapphire-paratime";
import { injected } from "@wagmi/core";
import type { EIP1193Provider } from "viem";

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
export function injectedWithSapphire(): ReturnType<typeof injected> {
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
	});
}
