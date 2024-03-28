import { wrapEIP1193Provider, wrap } from '@oasisprotocol/sapphire-paratime';
import type { Transport } from '@wagmi/core';
import { injected, custom } from '@wagmi/core';

type Window = {
  ethereum?: any;
};

const cachedProviders: Record<any, any> = {};

/**
 * Wrap the `window.ethereum` with the Sapphire encryption layer.
 * Used to provide encrypted transactions and calldata to Wagmi browser dApps.
 *
 * Example:
 * ```
 *
 *    import { injectedWithSapphire } from '@oasisprotocol/sapphire-wagmi';
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
        id: 'injected-sapphire',
        name: 'Injected (Sapphire)',
        provider(window?: Window) {
          if (window?.ethereum) {
            // Note: providers are cached as connectors are frequently retrieved
            //       it prevents sapphire wrapper being called multiple times
            //       which spams the RPC with oasis_callDataPublicKey requests
            if (!(window.ethereum in cachedProviders)) {
              cachedProviders[window.ethereum] = wrapEIP1193Provider(
                window.ethereum,
              );
            }
            return cachedProviders[window.ethereum];
          }
          return undefined;
        },
      } as unknown as any;
    },
  });
}

/**
 * Provide a Sapphire encrypted RPC transport for Wagmi or Viem.
 *
 * Example:
 * ```
 *
 *    import { sapphireTransport } from '@oasisprotocol/sapphire-wagmi';
 *
 *    export const config = createConfig({
 *      transports: {
 *        [sapphireTestnet.id]: sapphireTransport()
 *      },
 *      ...
 *    });
 *
 * ```
 *
 * @returns Same as custom()
 */
export function sapphireTransport(): Transport {
  return (params) => {
    const p = wrap(params.chain!.rpcUrls.default.http[0]);
    return custom(p)(params);
  };
}
