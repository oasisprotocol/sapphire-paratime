// SPDX-License-Identifier: Apache-2.0

import { BytesLike } from './ethersutils.js';
import { KeyFetcher } from './calldatapublickey.js';
import { SUBCALL_ADDR, CALLDATAPUBLICKEY_CALLDATA } from './constants.js';

// -----------------------------------------------------------------------------
// https://eips.ethereum.org/EIPS/eip-2696#interface
// https://eips.ethereum.org/EIPS/eip-1193#appendix-i-consumer-facing-api-documentation

export interface EIP1193_RequestArguments {
  readonly method: string;
  readonly params?: readonly unknown[] | object;
}

export type EIP1193_RequestFn = (
  args: EIP1193_RequestArguments,
) => Promise<unknown>;

export type Legacy_SendFn = (...args: unknown[]) => Promise<unknown>;

export type Legacy_Provider = {
  send: Legacy_SendFn;
};

export type EIP2696_EthereumProvider = {
  request: EIP1193_RequestFn;
};

export function isEthereumProvider<T extends object>(
  p: T,
): p is T & EIP2696_EthereumProvider {
  return 'request' in p && typeof p.request === 'function';
}

export function isLegacyProvider<T extends object>(
  p: T,
): p is T & Legacy_Provider {
  return 'send' in p && typeof p.send === 'function';
}

// -----------------------------------------------------------------------------

export interface SapphireWrapOptions {
  fetcher: KeyFetcher;
}

export function fillOptions(
  options: SapphireWrapOptions | undefined,
): SapphireWrapOptions {
  if (!options) {
    options = {} as SapphireWrapOptions;
  }
  if (!options.fetcher) {
    options.fetcher = new KeyFetcher();
  }
  return options;
}

// -----------------------------------------------------------------------------
// Wrap an Ethereum compatible provider to expose a consistent request() iface

const SAPPHIRE_WRAPPED_ETHEREUMPROVIDER =
  '#SAPPHIRE_WRAPPED_ETHEREUMPROVIDER' as const;

export function isWrappedEthereumProvider<P extends EIP2696_EthereumProvider>(
  p: P,
): p is P & { [SAPPHIRE_WRAPPED_ETHEREUMPROVIDER]: SapphireWrapOptions } {
  return p && SAPPHIRE_WRAPPED_ETHEREUMPROVIDER in p;
}

/**
 * Wrap an EIP-1193 or EIP-2696 compatible provider with Sapphire encryption
 *
 * ```typescript
 * const provider = wrapEthereumProvider(window.ethereum);
 * ```
 *
 * @param upstream Provides a send() or request() function
 * @param options (optional) Re-use parameters from other providers
 * @returns Sapphire wrapped provider
 */
export function wrapEthereumProvider<P extends EIP2696_EthereumProvider>(
  upstream: P,
  options?: SapphireWrapOptions,
): P {
  if (isWrappedEthereumProvider(upstream)) {
    return upstream;
  }

  if (!isEthereumProvider(upstream) && !isLegacyProvider(upstream)) {
    throw new Error('It is neither an Ethereum nor a Legacy provider');
  }

  const filled_options = fillOptions(options);

  // if upstream provides a send() function but not request function
  // then derive a request() function from the send() function
  // if we do this, don't then re-wrap the send() function
  // only wrap the send() function if there was a request() function

  const request = makeSapphireRequestFn(upstream, filled_options);
  const hooks: Record<string, unknown> = { request };

  // We prefer a request() method, but a provider may expose a send() method
  // Like Hardhat's LazyInitializationProviderAdapter, which is used with Ethers
  // So, everything gets sent through the Sapphire-wrapped request() function
  if ('send' in upstream)
    hooks.send = (method: string, params?: any[]) => {
      return request({ method, params });
    };

  // sendAsync implementations vary too widely to be used as a standard
  if ('sendAsync' in upstream)
    hooks.sendAsync = () => {
      throw new Error('sendAsync not supported!');
    };

  return makeTaggedProxyObject(
    upstream,
    SAPPHIRE_WRAPPED_ETHEREUMPROVIDER,
    filled_options,
    hooks,
  );
}

const SAPPHIRE_EIP1193_REQUESTFN = '#SAPPHIRE_EIP1193_REQUESTFN' as const;

export function isWrappedRequestFn<
  P extends EIP2696_EthereumProvider['request'],
>(p: P): p is P & { [SAPPHIRE_EIP1193_REQUESTFN]: SapphireWrapOptions } {
  return p && SAPPHIRE_EIP1193_REQUESTFN in p;
}

function isCallDataPublicKeyQuery(params?: object | readonly unknown[]) {
  return (
    params &&
    Array.isArray(params) &&
    params.length > 0 &&
    params[0].to === SUBCALL_ADDR &&
    params[0].data === CALLDATAPUBLICKEY_CALLDATA
  );
}

/**
 * Creates an EIP-1193 compatible request() function
 * @param provider Upstream EIP-1193 provider to forward requests to
 * @param options
 * @returns
 */
export function makeSapphireRequestFn(
  provider: EIP2696_EthereumProvider,
  options?: SapphireWrapOptions,
): EIP2696_EthereumProvider['request'] {
  if (isWrappedRequestFn(provider.request)) {
    return provider.request;
  }

  const filled_options = fillOptions(options);

  const f = async (args: EIP1193_RequestArguments) => {
    const cipher = await filled_options.fetcher.cipher(provider);
    const { method, params } = args;

    // Encrypt requests which can be encrypted
    if (
      params &&
      Array.isArray(params) &&
      /^eth_((send|sign)Transaction|call|estimateGas)$/.test(method) &&
      params[0].data // Ignore balance transfers without calldata
    ) {
      params[0].data = cipher.encryptCall(params[0].data);
    }

    const res = await provider.request({
      method,
      params: params ?? [],
    });

    // Decrypt responses which return encrypted data
    if (method === 'eth_call') {
      // If it's an unencrypted core.CallDataPublicKey query, don't attempt to decrypt the response
      if (!isCallDataPublicKeyQuery(params)) {
        return cipher.decryptResult(res as BytesLike);
      }
    }

    return res;
  };

  return makeTaggedProxyObject(f, SAPPHIRE_EIP1193_REQUESTFN, filled_options);
}

// -----------------------------------------------------------------------------

export function makeTaggedProxyObject<T extends object>(
  upstream: T,
  propname: string,
  options: SapphireWrapOptions,
  hooks?: Record<string, any>,
): T {
  return new Proxy(upstream, {
    has(target, p) {
      if (p === propname) return true;
      return Reflect.has(target, p);
    },
    get(upstream, prop) {
      if (prop === propname) return options;
      if (hooks && prop in hooks) return Reflect.get(hooks, prop);
      const value = Reflect.get(upstream, prop);
      return typeof value === 'function' ? value.bind(upstream) : value;
    },
  });
}
