import * as cbor from 'cborg';
import { BytesLike, isBytesLike, hexlify, getBytes } from 'ethers';
import deoxysii from '@oasisprotocol/deoxysii';
import { sha512_256 } from '@noble/hashes/sha512';
import { hmac } from '@noble/hashes/hmac';
import nacl, { BoxKeyPair } from 'tweetnacl';

import { CallError } from './index.js';

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
  public abstract kind: Kind;
  public abstract publicKey: Uint8Array;
  public abstract epoch: number | undefined;

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
    const { data, nonce } = await this.encryptCallData(getBytes(plaintext));
    const pk = this.publicKey;
    const epoch = this.epoch;
    const body = pk.length && nonce.length ? { pk, nonce, data, epoch } : data;
    if (this.kind === Kind.Plain) return { body };
    return { format: this.kind, body };
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
      await this.decryptCallResult(cbor.decode(getBytes(callResult))),
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
      return getBytes(res.ok);
    const { nonce, data } = (res.ok as AeadEnvelope) ?? res.unknown;
    const inner = cbor.decode(await this.decrypt(nonce, data));
    if (inner.ok) return getBytes(inner.ok);
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
  public override readonly epoch = undefined;

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
  public override readonly epoch: number | undefined;

  private cipher: deoxysii.AEAD;
  private key: Uint8Array; // Stored for curious users.

  /** Creates a new cipher using an ephemeral keypair stored in memory. */
  static ephemeral(peerPublicKey: BytesLike, epoch?: number): X25519DeoxysII {
    const keypair = nacl.box.keyPair();
    return new X25519DeoxysII(keypair, getBytes(peerPublicKey), epoch);
  }

  static fromSecretKey(
    secretKey: BytesLike,
    peerPublicKey: BytesLike,
    epoch?: number,
  ): X25519DeoxysII {
    const keypair = nacl.box.keyPair.fromSecretKey(getBytes(secretKey));
    return new X25519DeoxysII(keypair, getBytes(peerPublicKey), epoch);
  }

  public constructor(
    keypair: BoxKeyPair,
    peerPublicKey: Uint8Array,
    epoch?: number,
  ) {
    super();
    this.publicKey = keypair.publicKey;
    // Derive a shared secret using X25519 (followed by hashing to remove ECDH bias).

    this.epoch = epoch;

    const keyBytes = hmac
      .create(
        sha512_256,
        new TextEncoder().encode('MRAE_Box_Deoxys-II-256-128'),
      )
      .update(nacl.scalarMult(keypair.secretKey, peerPublicKey))
      .digest().buffer;

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
  public override readonly epoch = undefined;

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
