import {
	type SapphireAnnex,
	wrapEIP1193Provider,
} from "@oasisprotocol/sapphire-paratime";
import { injected } from "@wagmi/core";
import { type EIP1193Provider } from "viem";

type Window = {
	ethereum?: EIP1193Provider;
};

const cachedProviders: Map<EIP1193Provider, EIP1193Provider> = new Map();

/**
 * Wrap the `window.ethereum` with the Sapphire encryption layer.
 * Used to provide encrypted transactions and calldata to Wagmi browser dApps.
 *
 * Example:
 * ```
 *
 *    import { injectedWithSapphire } from '@oasisprotocol/sapphire-wagmi-v2';
 *
 *    export const config = createConfig({
 *      connectors: [
 *        injectedWithSapphire()
 *      ],
 *      ...
 *    });
 *
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
							type SapphireEip1193Type = Parameters<
								typeof wrapEIP1193Provider
							>[0];
							const wp = wrapEIP1193Provider(
								window.ethereum as unknown as SapphireEip1193Type,
							) as EIP1193Provider & SapphireAnnex;
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
