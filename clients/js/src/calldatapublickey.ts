// SPDX-License-Identifier: Apache-2.0

import { decode as cborDecode } from 'cborg';
import { fromQuantity, getBytes } from './ethersutils.js';
import type { EIP2696_EthereumProvider } from './provider.js';
import { SUBCALL_ADDR, CALLDATAPUBLICKEY_CALLDATA } from './constants.js';
import { Cipher, X25519DeoxysII } from './cipher.js';
import { ed25519_verify_raw } from './munacl.js';
import { sha512_256 } from '@noble/hashes/sha512';

/**
 * calldata public keys are cached for this amount of time
 * This prevents frequent unnecessary re-fetches
 * This time is in milliseconds
 */
const DEFAULT_PUBKEY_CACHE_EXPIRATION_MS = 60 * 5 * 1000;

// -----------------------------------------------------------------------------
// Fetch calldata public key
// Well use provider when possible, and fallback to HTTP(S)? requests
// e.g. MetaMask doesn't allow the oasis_callDataPublicKey JSON-RPC method

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
  epoch?: bigint;

  // At which epoch does this key become invalid
  expiration?: bigint;

  // Which chain ID is this key for?
  chainId: number;

  // When was the key fetched
  fetched: Date;
}

function parseBigIntFromByteArray(bytes: Uint8Array): bigint {
  const eight = BigInt(8);
  return bytes.reduce((acc, byte) => (acc << eight) | BigInt(byte), BigInt(0));
}

class AbiDecodeError extends Error {}

/// Manual ABI-parsing of ['uint', 'bytes']
function parseAbiEncodedUintBytes(bytes: Uint8Array): [bigint, Uint8Array] {
  if (bytes.length < 32 * 3) {
    throw new AbiDecodeError('too short');
  }
  const status = parseBigIntFromByteArray(bytes.slice(0, 32));
  const offset = Number(parseBigIntFromByteArray(bytes.slice(32, 64)));
  if (bytes.length < offset + 32) {
    throw new AbiDecodeError('too short, offset');
  }
  const data_length = Number(
    parseBigIntFromByteArray(bytes.slice(offset, offset + 32)),
  );
  if (bytes.length < offset + 32 + data_length) {
    throw new AbiDecodeError('too short, data');
  }
  const data = bytes.slice(offset + 32, offset + 32 + data_length);
  return [status, data];
}

const UINT64_MIN = BigInt(0);
const UINT64_MAX = BigInt(1) << BigInt(64);

function u64tobytes(x: bigint): Uint8Array {
  if (x < UINT64_MIN || x > UINT64_MAX) {
    throw new Error('Value out of range for uint64');
  }
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setBigUint64(0, x, false); // false for big-endian
  return new Uint8Array(buffer);
}

export function verifyRuntimePublicKey(
  signerPk: CallDataPublicKey,
  pk: CallDataPublicKey,
  runtime_id: Uint8Array,
  key_pair_id: Uint8Array,
) {
  const PUBLIC_KEY_SIGNATURE_CONTEXT = new TextEncoder().encode(
    'oasis-core/keymanager: pk signature',
  );

  let body = new Uint8Array([
    ...pk.key,
    ...pk.checksum,
    ...runtime_id,
    ...key_pair_id,
  ]);

  if (pk.epoch !== undefined) {
    body = new Uint8Array([...body, ...u64tobytes(pk.epoch)]);
  }

  if (pk.expiration !== undefined) {
    body = new Uint8Array([...body, ...u64tobytes(BigInt(pk.expiration))]);
  }

  const ctx = sha512_256.create();
  ctx.update(PUBLIC_KEY_SIGNATURE_CONTEXT);
  ctx.update(body);
  const digest = ctx.digest();

  return ed25519_verify_raw(pk.signature, signerPk.key, digest);
}

/**
 * Picks the most user-trusted runtime calldata public key source based on what
 * connections are available.
 *
 * NOTE: MetaMask does not support Web3 methods it doesn't know about, so we
 *       have to fall-back to fetch()ing directly via the default chain gateway.
 */
export async function fetchRuntimePublicKey(args: {
  upstream: EIP2696_EthereumProvider;
}) {
  let chainId: number | undefined = undefined;

  const { upstream } = args;
  chainId = fromQuantity(
    (await upstream.request({
      method: 'eth_chainId',
    })) as string | number,
  );

  // NOTE: we hard-code the eth_call data, as it never changes
  //       It's equivalent to: // abi_encode(['string', 'bytes'], ['core.CallDataPublicKey', cborEncode(null)])
  const call_resp = (await upstream.request({
    method: 'eth_call',
    params: [
      {
        to: SUBCALL_ADDR,
        data: CALLDATAPUBLICKEY_CALLDATA,
      },
      'latest',
    ],
  })) as string;
  const resp_bytes = getBytes(call_resp);

  // NOTE: to avoid pulling-in a full ABI decoder dependency, slice it manually
  const [resp_status, resp_cbor] = parseAbiEncodedUintBytes(resp_bytes);
  if (resp_status !== BigInt(0)) {
    throw new Error(`fetchRuntimePublicKey - invalid status: ${resp_status}`);
  }

  const response = cborDecode(resp_cbor);

  return {
    key: response.public_key.key,
    checksum: response.public_key.checksum,
    signature: response.public_key.signature,
    epoch: response.epoch,
    chainId,
    fetched: new Date(),
  } as CallDataPublicKey;
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
