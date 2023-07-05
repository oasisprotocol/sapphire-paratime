import {
  BytesLike,
  arrayify,
  hexlify,
  isBytesLike,
} from '@ethersproject/bytes';
import * as cbor from 'cborg';
import deoxysii from '@oasisprotocol/deoxysii';
import { IncomingMessage } from 'http';
import { sha512_256 } from 'js-sha512';
import nacl, { BoxKeyPair } from 'tweetnacl';
import { Promisable } from 'type-fest';

import { CallError, NETWORKS, OASIS_CALL_DATA_PUBLIC_KEY } from './index.js';

export enum Kind {
  Plain = 0,
  X25519DeoxysII = 1,
  Mock = Number.MAX_SAFE_INTEGER,
}

export type Envelope = {
  format?: Kind;
  body:
    | Uint8Array
    | {
        pk: Uint8Array;
        nonce: Uint8Array;
        data: Uint8Array;
      };
};

type AeadEnvelope = { nonce: Uint8Array; data: Uint8Array };
export type CallResult = {
  ok?: string | Uint8Array | AeadEnvelope;
  fail?: CallFailure;
  unknown?: AeadEnvelope;
};
export type CallFailure = { module: string; code: number; message?: string };

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
    const { data, nonce } = await this.encryptCallData(arrayify(plaintext));
    const [format, pk] = await Promise.all([this.kind, this.publicKey]);
    const body = pk.length && nonce.length ? { pk, nonce, data } : data;
    if (format === Kind.Plain) return { body };
    return { format, body };
  }

  protected async encryptCallData(
    plaintext: Uint8Array,
  ): Promise<AeadEnvelope> {
    const body = cbor.encode({ body: plaintext });
    const { ciphertext: data, nonce } = await this.encrypt(body);
    return { data, nonce };
  }

  /**
   *  Decrypts the data contained within call
   *
   *  This is useful for creating tools, and also decoding
   *  previously-sent transactions that have used the same
   *  encryption key.
   */

  public async decryptCallData(
    nonce: Uint8Array,
    ciphertext: Uint8Array,
  ): Promise<Uint8Array> {
    return cbor.decode(await this.decrypt(nonce, ciphertext)).body;
  }

  /**
   * @hidden Encrypts a CallResult in the same way as would be returned by the runtime.
   * This method is not part of the SemVer interface and may be subject to change.
   */
  public async encryptCallResult(
    result: CallResult,
    reportUnknown = false,
  ): Promise<Uint8Array> {
    if (result.fail) return cbor.encode(result);
    const encodedResult = cbor.encode(result);
    const { ciphertext, nonce } = await this.encrypt(encodedResult);
    const prop = reportUnknown ? 'unknown' : 'ok';
    return cbor.encode({ [prop]: { nonce, data: ciphertext } });
  }

  /** Decrypts the data contained within a hex-encoded serialized envelope. */
  public async decryptEncoded(callResult: BytesLike): Promise<string> {
    return hexlify(
      await this.decryptCallResult(cbor.decode(arrayify(callResult))),
    );
  }

  /** Decrypts the data contained within a result envelope. */
  public async decryptCallResult(res: CallResult): Promise<Uint8Array> {
    function formatFailure(fail: CallFailure): string {
      if (fail.message) return fail.message;
      return `Call failed in module '${fail.module}' with code '${fail.code}'`;
    }
    if (res.fail) throw new CallError(formatFailure(res.fail), res.fail);
    if (res.ok && (typeof res.ok === 'string' || res.ok instanceof Uint8Array))
      return arrayify(res.ok);
    const { nonce, data } = (res.ok as AeadEnvelope) ?? res.unknown;
    const inner = cbor.decode(await this.decrypt(nonce, data));
    if (inner.ok) return arrayify(inner.ok);
    if (inner.fail) throw new CallError(formatFailure(inner.fail), inner.fail);
    throw new CallError(
      `Unexpected inner call result: ${JSON.stringify(inner)}`,
      inner,
    );
  }
}

/**
 * A {@link Cipher} that does not encrypt data.
 *
 * This cipher is useful for debugging and sending messages that
 * you would prefer everyone to be able to see (e.g., for auditing purposes).
 */
export class Plain extends Cipher {
  public override readonly kind = Kind.Plain;
  public override readonly publicKey = new Uint8Array();

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

  async encryptCallData(
    plaintext: Uint8Array,
  ): Promise<{ data: Uint8Array; nonce: Uint8Array }> {
    return { data: plaintext, nonce: new Uint8Array() };
  }
}

/**
 * A {@link Cipher} that derives a shared secret using X25519 and then uses DeoxysII for encrypting using that secret.
 *
 * This is the default cipher.
 */
export class X25519DeoxysII extends Cipher {
  public override readonly kind = Kind.X25519DeoxysII;
  public override readonly publicKey: Uint8Array;

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
      .update(nacl.scalarMult(keypair.secretKey, peerPublicKey))
      .arrayBuffer();
    this.key = new Uint8Array(keyBytes);
    this.cipher = new deoxysii.AEAD(new Uint8Array(this.key)); // deoxysii owns the input
  }

  public async encrypt(plaintext: Uint8Array): Promise<{
    ciphertext: Uint8Array;
    nonce: Uint8Array;
  }> {
    const nonce = nacl.randomBytes(deoxysii.NonceSize);
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

/** A cipher that pretends to be an encrypting cipher. Used for tests. */
export class Mock extends Cipher {
  public override readonly kind = Kind.Mock;
  public override readonly publicKey = new Uint8Array([1, 2, 3]);

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

/**
 * A Cipher that constructs itself only when needed.
 * Useful for deferring async construction (e.g., fetching public keys) until in an async context.
 *
 * @param generator A function that yields the cipher implementation. This function must be multiply callable and without observable side effects (c.f. Rust's `impl Fn()`).
 */
export function lazy(generator: () => Promisable<Cipher>): Cipher {
  // Note: in cases when `generate` is run concurrently, the first fulfillment will be used.
  return new Proxy(
    {},
    {
      get(target: { inner?: Promise<Cipher> }, prop) {
        // Props (Promiseable)
        if (prop === 'kind' || prop === 'publicKey') {
          if (!target.inner) target.inner = Promise.resolve(generator());
          return target.inner.then((c) => Reflect.get(c, prop));
        }
        // Funcs (async)
        return async (...args: unknown[]) => {
          if (!target.inner) target.inner = Promise.resolve(generator());
          return target.inner.then((c) => Reflect.get(c, prop).apply(c, args));
        };
      },
    },
  ) as Cipher;
}

export async function fetchRuntimePublicKeyByChainId(
  chainId: number,
  opts?: { fetch?: typeof fetch },
): Promise<Uint8Array> {
  const { defaultGateway: gatewayUrl } = NETWORKS[chainId];
  if (!gatewayUrl)
    throw new Error(
      `Unable to fetch runtime public key for network with unknown ID: ${chainId}.`,
    );
  const fetchImpl = globalThis?.fetch ?? opts?.fetch;
  const res = await (fetchImpl
    ? fetchRuntimePublicKeyBrowser(gatewayUrl, fetchImpl)
    : fetchRuntimePublicKeyNode(gatewayUrl));
  return arrayify(res.result.key);
}

type CallDataPublicKeyResponse = {
  result: { key: string; checksum: string; signature: string };
};

async function fetchRuntimePublicKeyNode(
  gwUrl: string,
): Promise<CallDataPublicKeyResponse> {
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
    const req = https.request(gwUrl, opts, (res: IncomingMessage) => {
      const chunks: Buffer[] = [];
      res.on('error', (err) => reject(err));
      res.on('data', (chunk) => chunks.push(chunk));
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
    method: OASIS_CALL_DATA_PUBLIC_KEY,
    params: [],
  });
}
