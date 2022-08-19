import {
  BytesLike,
  arrayify,
  hexlify,
  isBytesLike,
} from '@ethersproject/bytes';
import * as cbor from 'cborg';
// @ts-expect-error missing declaration
import deoxysii from 'deoxysii';
import { sha512_256 } from 'js-sha512';
import nacl, { BoxKeyPair, randomBytes, scalarMult } from 'tweetnacl';
import { Promisable } from 'type-fest';

import { CallError, NETWORKS } from './index.js';

export enum Kind {
  Plain = 0,
  X25519DeoxysII = 1,
  Mock = Number.MAX_SAFE_INTEGER,
}

export type Envelope = {
  format: Kind;
  body:
    | Uint8Array
    | {
        pk: Uint8Array;
        nonce: Uint8Array;
        data: Uint8Array;
      };
};

export type CallResult = {
  ok?: unknown;
  fail?: { module: string; code: number; message?: string };
  unknown?: unknown;
};

export abstract class Cipher {
  public abstract kind: Promisable<Kind>;
  public abstract publicKey: Promisable<Uint8Array>;

  public abstract encrypt(plaintext: Uint8Array): Promise<{
    ciphertext: Uint8Array;
    nonce: Uint8Array;
  }>;
  public abstract decrypt(
    nonce: Uint8Array,
    ciphertext: Uint8Array,
  ): Promise<Uint8Array>;

  /** Encrypts the plaintext and encodes it for sending. */
  public async encryptEncode(plaintext?: BytesLike): Promise<string> {
    const envelope = await this.encryptEnvelope(plaintext);
    return envelope ? hexlify(cbor.encode(envelope)) : '';
  }

  /** Encrypts the plaintext and formats it into an envelope. */
  public async encryptEnvelope(
    plaintext?: BytesLike,
  ): Promise<Envelope | undefined> {
    if (plaintext === undefined) return;
    if (!isBytesLike(plaintext)) {
      throw new Error('Attempted to sign tx having non-byteslike data.');
    }
    if (plaintext.length === 0) return; // Txs without data are just balance transfers, and all data in those is public.
    const { ciphertext: data, nonce } = await this.encrypt(arrayify(plaintext));
    const [format, pk] = await Promise.all([this.kind, this.publicKey]);
    const body = pk.length && nonce.length ? { pk, nonce, data } : data;
    return { format, body };
  }

  /** Decrypts the data contained within a hex-encoded serialized envelope. */
  public async decryptEncoded(callResult: BytesLike): Promise<string> {
    return hexlify(
      await this.decryptCallResult(cbor.decode(arrayify(callResult))),
    );
  }

  /** Decrypts the data contained within a result envelope. */
  public async decryptCallResult(callResult: CallResult): Promise<Uint8Array> {
    const { ok, fail, unknown } = callResult;
    if (ok) {
      if (typeof ok === 'string') return arrayify(ok);
      if (ok instanceof Uint8Array) return ok;
      throw new CallError(`Unexpected OK call result: ${ok}`, ok);
    }
    if (fail) {
      throw new CallError(
        fail.message ??
          `Call failed in module '${fail.module}' with code '${fail.code}'`,
        fail,
      );
    }
    let encryptionEnvelope: Uint8Array;
    if (typeof unknown === 'string') encryptionEnvelope = arrayify(unknown);
    else if (unknown instanceof Uint8Array) encryptionEnvelope = unknown;
    else throw new CallError(`Unexpected call result: ${unknown}`, unknown);
    const { nonce, data } = cbor.decode(encryptionEnvelope);
    return this.decrypt(nonce, data);
  }
}

export class Plain extends Cipher {
  public readonly kind = Kind.Plain;
  public readonly publicKey = new Uint8Array();

  public async encrypt(plaintext: Uint8Array): Promise<{
    ciphertext: Uint8Array;
    nonce: Uint8Array;
  }> {
    return { ciphertext: plaintext, nonce: new Uint8Array() };
  }

  public async decrypt(
    _nonce: Uint8Array,
    ciphertext: Uint8Array,
  ): Promise<Uint8Array> {
    return ciphertext;
  }
}

export class X25519DeoxysII extends Cipher {
  public readonly kind = Kind.X25519DeoxysII;
  public readonly publicKey: Uint8Array;

  private cipher: deoxysii.AEAD;
  private key: Uint8Array; // Stored for curious users.

  /** Creates a new cipher using an ephemeral keypair stored in memory. */
  static ephemeral(peerPublicKey: BytesLike): X25519DeoxysII {
    const keypair = nacl.box.keyPair();
    return new X25519DeoxysII(
      keypair,
      arrayify(peerPublicKey, { allowMissingPrefix: true }),
    );
  }

  static fromSecretKey(
    secretKey: BytesLike,
    peerPublicKey: BytesLike,
  ): X25519DeoxysII {
    const keypair = nacl.box.keyPair.fromSecretKey(arrayify(secretKey));
    return new X25519DeoxysII(keypair, arrayify(peerPublicKey));
  }

  public constructor(keypair: BoxKeyPair, peerPublicKey: Uint8Array) {
    super();
    this.publicKey = keypair.publicKey;
    // Derive a shared secret using X25519 (followed by hashing to remove ECDH bias).
    const keyBytes = sha512_256.hmac
      .create('MRAE_Box_Deoxys-II-256-128')
      .update(scalarMult(keypair.secretKey, peerPublicKey))
      .arrayBuffer();
    this.key = new Uint8Array(keyBytes);
    this.cipher = new deoxysii.AEAD(new Uint8Array(this.key)); // deoxysii owns the input
  }

  public async encrypt(plaintext: Uint8Array): Promise<{
    ciphertext: Uint8Array;
    nonce: Uint8Array;
  }> {
    const nonce = randomBytes(deoxysii.NonceSize);
    const ciphertext = this.cipher.encrypt(nonce, plaintext);
    return { nonce, ciphertext };
  }

  public async decrypt(
    nonce: Uint8Array,
    ciphertext: Uint8Array,
  ): Promise<Uint8Array> {
    return this.cipher.decrypt(nonce, ciphertext);
  }
}

export class Mock extends Cipher {
  public readonly kind = Kind.Mock;
  public readonly publicKey = new Uint8Array([1, 2, 3]);

  public static readonly NONCE = new Uint8Array([10, 20, 30, 40]);

  public async encrypt(plaintext: Uint8Array): Promise<{
    ciphertext: Uint8Array;
    nonce: Uint8Array;
  }> {
    return { nonce: Mock.NONCE, ciphertext: plaintext };
  }

  public async decrypt(
    nonce: Uint8Array,
    ciphertext: Uint8Array,
  ): Promise<Uint8Array> {
    if (hexlify(nonce) !== hexlify(Mock.NONCE))
      throw new Error('incorrect nonce');
    return ciphertext;
  }
}

export function lazy(generator: () => Promisable<Cipher>): Cipher {
  return new Proxy(
    {},
    {
      get(target: { inner?: Cipher }, prop) {
        // Props (Promiseable)
        if (prop === 'kind' || prop === 'publicKey') {
          if (target.inner) return Reflect.get(target.inner, prop);
          return Promise.resolve(generator()).then((inner: Cipher) => {
            target.inner = inner;
            return Reflect.get(inner, prop);
          });
        }
        // Funcs (async)
        return async (...args: unknown[]) => {
          if (!target.inner) target.inner = await generator();
          return Reflect.get(target.inner, prop).bind(target.inner)(...args);
        };
      },
    },
  ) as Cipher;
}

const OASIS_CALL_DATA_PUBLIC_KEY = 'oasis_callDataPublicKey';

export async function fetchRuntimePublicKey(
  source:
    | { gatewayUrl: string }
    | { chainId: number }
    | { send: (method: string, params: any[]) => Promise<any> },
  opts?: { fetch?: typeof fetch },
): Promise<Uint8Array> {
  if ('send' in source) {
    const { key } = await source.send(OASIS_CALL_DATA_PUBLIC_KEY, []);
    return arrayify(key);
  }

  let gatewayUrl: string;
  if ('gatewayUrl' in source) {
    gatewayUrl = source.gatewayUrl;
  } else {
    const chainId = source.chainId;
    ({ defaultGateway: gatewayUrl } = NETWORKS[chainId]);
    if (!gatewayUrl)
      throw new Error(
        `Unable to fetch runtime public key for network with unknown ID: ${chainId}.`,
      );
  }
  const fetchImpl = globalThis?.fetch ?? opts?.fetch;
  const res = await (fetchImpl
    ? fetchRuntimePublicKeyBrowser(gatewayUrl, fetchImpl)
    : fetchRuntimePublicKeyNode(gatewayUrl));
  return arrayify(res.key);
}

type CallDataPublicKeyResponse = {
  key: string;
  checksum: string;
  signature: string;
};

async function fetchRuntimePublicKeyNode(
  gwUrl: string,
): Promise<CallDataPublicKeyResponse> {
  const https = await import('node:https');
  const body = makeCallDataPublicKeyBody();
  return new Promise((resolve, reject) => {
    const opts = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': body.length,
      },
    };
    const req = https.request(gwUrl, opts, (res) => {
      const chunks: Buffer[] = [];
      res.on('error', (err) => reject(err));
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      });
    });
    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });
}

async function fetchRuntimePublicKeyBrowser(
  gwUrl: string,
  fetchImpl: typeof fetch,
): Promise<CallDataPublicKeyResponse> {
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
    method: 'oasis_callDataPublicKey',
    params: [],
  });
}
