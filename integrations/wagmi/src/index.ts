import { wrapEIP1193Provider, wrap } from '@oasisprotocol/sapphire-paratime';
import type { Transport } from '@wagmi/core';
import { injected, custom } from '@wagmi/core';

const cachedProviders: Record<any, any> = {};

type Window = {
  ethereum?: any;
};

export function injectedWithSapphire(): ReturnType<typeof injected> {
  return injected({
    target: () => {
      return {
        id: 'injected-sapphire',
        name: 'Injected (Sapphire)',
        provider(window?: Window) {
          if (window?.ethereum) {
            // Note: providers are cached as connectors are frequently retrieved
            //       this prevents the sapphire wrap function being called multiple
            //       times and spamming RPC with oasis_callDataPublicKey requests
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

export function sapphireTransport(): Transport {
  return (params) => {
    const p = wrap(params.chain!.rpcUrls.default.http[0]);
    return custom(p)(params);
  };
}
