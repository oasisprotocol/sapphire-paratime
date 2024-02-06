import { getBytes } from 'ethers';

import { UpstreamProvider, EIP1193Provider } from './interfaces.js';
import { CallError, OASIS_CALL_DATA_PUBLIC_KEY } from './index.js';
import { NETWORKS } from './networks.js';
import { Cipher, Mock as MockCipher, X25519DeoxysII } from './cipher.js';

const DEFAULT_PUBKEY_CACHE_EXPIRATION_MS = 60 * 5 * 1000; // 5 minutes in milliseconds

// -----------------------------------------------------------------------------
// Fetch calldata public key
// Well use provider when possible, and fallback to HTTP(S)? requests
// e.g. MetaMask doesn't allow the oasis_callDataPublicKey JSON-RPC method

type RawCallDataPublicKeyResponseResult = {
  key: string;
  checksum: string;
  signature: string;
  epoch: number;
};

type RawCallDataPublicKeyResponse = {
  result: RawCallDataPublicKeyResponseResult;
};

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

// TODO: remove, this is unecessary, node has `fetch` now?
async function fetchRuntimePublicKeyNode(
  gwUrl: string,
): Promise<RawCallDataPublicKeyResponse> {
  // Import http or https, depending on the URI scheme.
  const https = await import(/* webpackIgnore: true */ gwUrl.split(':')[0]);

  const body = makeCallDataPublicKeyBody();
  return new Promise((resolve, reject) => {
    const opts = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': body.length,
      },
    };
    const req = https.request(gwUrl, opts, (res: any) => {
      const chunks: Buffer[] = [];
      res.on('error', (err: any) => reject(err));
      res.on('data', (chunk: any) => chunks.push(chunk));
      res.on('end', () => {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      });
    });
    req.on('error', (err: Error) => reject(err));
    req.write(body);
    req.end();
  });
}

async function fetchRuntimePublicKeyBrowser(
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
    throw new CallError('Failed to fetch runtime public key.', res);
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
  const res = await (fetchImpl
    ? fetchRuntimePublicKeyBrowser(defaultGateway, fetchImpl)
    : fetchRuntimePublicKeyNode(defaultGateway));
  return toCallDataPublicKey(res.result, chainId);
}

function fromQuantity(x: number | string): number {
  if (typeof x === 'string') {
    if (x.startsWith('0x')) {
      return parseInt(x, 16);
    }
    return parseInt(x); // Assumed to be base 10
  }
  return x;
}

/**
 * Picks the most user-trusted runtime calldata public key source based on what
 * connections are available.
 *
 * NOTE: MetaMask does not support Web3 methods it doesn't know about, so we have to
 *       fall-back to manually querying the default gateway.
 */
export async function fetchRuntimePublicKey(
  upstream: UpstreamProvider,
): Promise<CallDataPublicKey> {
  const provider = 'provider' in upstream ? upstream['provider'] : upstream;
  let chainId: number | undefined;
  if (provider) {
    let resp;
    // It's probably an EIP-1193 provider
    if ('request' in provider) {
      const source = provider as EIP1193Provider;
      chainId = fromQuantity(
        (await source.request({ method: 'eth_chainId' })) as string | number,
      );
      try {
        resp = await source.request({
          method: OASIS_CALL_DATA_PUBLIC_KEY,
          params: [],
        });
      } catch (ex) {
        // don't do anything, move on to try next
      }
    }
    // If it's a `send` provider
    else if ('send' in provider) {
      const source = provider as {
        send: (method: string, params: any[]) => Promise<any>;
      };
      chainId = fromQuantity(await source.send('eth_chainId', []));
      try {
        resp = await source.send(OASIS_CALL_DATA_PUBLIC_KEY, []);
      } catch (ex) {
        // don't do anything, move on to try chainId fetch
      }
    }
    // Otherwise, we have no idea what to do with this provider!
    else {
      throw new Error(
        'fetchRuntimePublicKey does not support non-request non-send provier!',
      );
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

export abstract class AbstractKeyFetcher {
  public abstract fetch(upstream: UpstreamProvider): Promise<CallDataPublicKey>;
  public abstract cipher(upstream: UpstreamProvider): Promise<Cipher>;
}

export class KeyFetcher extends AbstractKeyFetcher {
  readonly timeoutMilliseconds: number;
  public pubkey?: CallDataPublicKey;

  constructor(in_timeoutMilliseconds?: number) {
    super();
    if (!in_timeoutMilliseconds) {
      in_timeoutMilliseconds = DEFAULT_PUBKEY_CACHE_EXPIRATION_MS;
    }
    this.timeoutMilliseconds = in_timeoutMilliseconds;
  }

  /**
   * Retrieve cached key if possible, otherwise fetch a fresh one
   *
   * @param upstream Upstream ETH JSON-RPC provider
   * @returns calldata public key
   */
  public async fetch(upstream: UpstreamProvider): Promise<CallDataPublicKey> {
    if (this.pubkey) {
      const pk = this.pubkey;
      const expiry = Date.now() - this.timeoutMilliseconds;
      if (pk.fetched && pk.fetched.valueOf() > expiry) {
        // XXX: if provider switch chain, may return cached key for wrong chain
        return pk;
      }
    }
    return (this.pubkey = await fetchRuntimePublicKey(upstream));
  }

  public async cipher(upstream: UpstreamProvider): Promise<Cipher> {
    const kp = await this.fetch(upstream);
    return X25519DeoxysII.ephemeral(kp.key, kp.epoch);
  }
}

export class MockKeyFetcher extends AbstractKeyFetcher {
  #_cipher: MockCipher;

  constructor(in_cipher: MockCipher) {
    super();
    this.#_cipher = in_cipher;
  }

  public async fetch(): Promise<CallDataPublicKey> {
    throw new Error("MockKeyFetcher doesn't support fetch(), only cipher()");
  }

  public async cipher(): Promise<Cipher> {
    return this.#_cipher;
  }
}
