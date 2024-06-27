// SPDX-License-Identifier: Apache-2.0

import { fromQuantity, getBytes } from './ethersutils.js';
import type { EIP2696_EthereumProvider } from './provider.js';
import { NETWORKS } from './networks.js';
import { Cipher, X25519DeoxysII } from './cipher.js';

/**
 * calldata public keys are cached for this amount of time
 * This prevents frequent unnecessary re-fetches
 * This time is in milliseconds
 */
const DEFAULT_PUBKEY_CACHE_EXPIRATION_MS = 60 * 5 * 1000;

export const OASIS_CALL_DATA_PUBLIC_KEY = 'oasis_callDataPublicKey';

// -----------------------------------------------------------------------------
// Fetch calldata public key
// Well use provider when possible, and fallback to HTTP(S)? requests
// e.g. MetaMask doesn't allow the oasis_callDataPublicKey JSON-RPC method

export type RawCallDataPublicKeyResponseResult = {
  key: string;
  checksum: string;
  signature: string;
  epoch: number;
};

export type RawCallDataPublicKeyResponse = {
  result: RawCallDataPublicKeyResponseResult;
};

export class FetchError extends Error {
  public constructor(message: string, public readonly response?: unknown) {
    super(message);
  }
}

export interface CallDataPublicKey {
  // PublicKey is the requested public key.
  key: Uint8Array;

  // Checksum is the checksum of the key manager state.
  checksum: Uint8Array;

  // Signature is the Sign(sk, (key || checksum)) from the key manager.
  signature: Uint8Array;

  // Epoch is the epoch of the ephemeral runtime key.
  epoch: number;

  // Which chain ID is this key for?
  chainId: number;

  // When was the key fetched
  fetched: Date;
}

function toCallDataPublicKey(
  result: RawCallDataPublicKeyResponseResult,
  chainId: number,
) {
  const key = getBytes(result.key);
  return {
    key,
    checksum: getBytes(result.checksum),
    signature: getBytes(result.signature),
    epoch: result.epoch,
    chainId,
    fetched: new Date(),
  } as CallDataPublicKey;
}

export async function fetchRuntimePublicKeyFromURL(
  gwUrl: string,
  fetchImpl: typeof fetch,
): Promise<RawCallDataPublicKeyResponse> {
  const res = await fetchImpl(gwUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: makeCallDataPublicKeyBody(),
  });
  if (!res.ok) {
    throw new FetchError('Failed to fetch runtime public key.', res);
  }
  return await res.json();
}

function makeCallDataPublicKeyBody(): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: Math.floor(Math.random() * 1e9),
    method: OASIS_CALL_DATA_PUBLIC_KEY,
    params: [],
  });
}

export async function fetchRuntimePublicKeyByChainId(
  chainId: number,
  opts?: { fetch?: typeof fetch },
): Promise<CallDataPublicKey> {
  const { defaultGateway } = NETWORKS[chainId];
  if (!defaultGateway)
    throw new Error(
      `Unable to fetch runtime public key for network with unknown ID: ${chainId}.`,
    );
  const fetchImpl = opts?.fetch ?? globalThis?.fetch;
  if (!fetchImpl) {
    throw new Error('No fetch implementation found!');
  }
  const res = await fetchRuntimePublicKeyFromURL(defaultGateway, fetchImpl);
  if( ! res.result ) {
    throw new Error(`fetchRuntimePublicKeyByChainId failed, empty result in: ${JSON.stringify(res)}`);
  }
  return toCallDataPublicKey(res.result, chainId);
}

/**
 * Picks the most user-trusted runtime calldata public key source based on what
 * connections are available.
 *
 * NOTE: MetaMask does not support Web3 methods it doesn't know about, so we
 *       have to fall-back to fetch()ing directly via the default chain gateway.
 */
export async function fetchRuntimePublicKey(
  args: { upstream: EIP2696_EthereumProvider } | { chainId: number },
) {
  let chainId: number | undefined = undefined;
  if ('upstream' in args) {
    let resp: any | undefined = undefined;
    const { upstream } = args;
    chainId = fromQuantity(
      (await upstream.request({
        method: 'eth_chainId',
      })) as string | number,
    );

    try {
      resp = await upstream.request({
        method: OASIS_CALL_DATA_PUBLIC_KEY,
        params: [],
      });
    } catch (ex) {
      // ignore RPC errors / failures
    }

    if (resp && 'key' in resp) {
      return toCallDataPublicKey(resp, chainId);
    }
  }

  if (!chainId) {
    throw new Error(
      'fetchRuntimePublicKey failed to retrieve chainId from provider',
    );
  }
  return fetchRuntimePublicKeyByChainId(chainId);
}

/**
 * Retrieves calldata public keys from RPC provider
 */
export class KeyFetcher {
  public pubkey?: CallDataPublicKey;

  constructor(
    readonly timeoutMilliseconds: number = DEFAULT_PUBKEY_CACHE_EXPIRATION_MS,
  ) {}

  /**
   * Retrieve cached key if possible, otherwise fetch a fresh one
   *
   * @param upstream Upstream ETH JSON-RPC provider
   * @returns calldata public key
   */
  public async fetch(
    upstream: EIP2696_EthereumProvider,
  ): Promise<CallDataPublicKey> {
    if (upstream === undefined) {
      throw new Error('fetch() Upstream must not be undefined!');
    }
    if (this.pubkey) {
      const pk = this.pubkey;
      const expiry = Date.now() - this.timeoutMilliseconds;
      if (pk.fetched && pk.fetched.valueOf() >= expiry) {
        // XXX: if provider switch chain, may return cached key for wrong chain
        return pk;
      }
    }
    return (this.pubkey = await fetchRuntimePublicKey({ upstream }));
  }

  public async cipher(upstream: EIP2696_EthereumProvider): Promise<Cipher> {
    const { key, epoch } = await this.fetch(upstream);
    return X25519DeoxysII.ephemeral(key, epoch);
  }

  public cipherSync() {
    if (!this.pubkey) {
      throw new Error('No cached pubkey!');
    }
    const { key, epoch } = this.pubkey;
    return X25519DeoxysII.ephemeral(key, epoch);
  }
}
