import { arrayify, hexlify } from '@ethersproject/bytes';
import * as cbor from 'cborg';
// @ts-expect-error missing declaration
import { TagSize } from 'deoxysii';
import nock from 'nock';
import fetchImpl from 'node-fetch';
import nacl from 'tweetnacl';

import {
  Plain,
  X25519DeoxysII,
  fetchRuntimePublicKeyByChainId,
  lazy,
} from '@oasisprotocol/sapphire-paratime/cipher.js';

const DATA = new Uint8Array([1, 2, 3, 4, 5]);

describe('Plain', () => {
  it('roundtrip', async () => {
    const cipher = new Plain();
    expect(cipher.publicKey).toHaveLength(0);
    expect(cipher.kind).toEqual(0);

    const { ciphertext, nonce } = await cipher.encrypt(DATA);
    expect(nonce).toHaveLength(0);
    expect(ciphertext).toEqual(DATA);

    const envelope = await cipher.encryptEnvelope(DATA);
    expect(envelope).toBeDefined();
    expect({ body: DATA }).toMatchObject(envelope!);
    expect(await cipher.encryptEnvelope()).not.toBeDefined();

    expect(await cipher.encryptEncode(DATA)).toEqual(
      hexlify(cbor.encode(envelope)),
    );
    expect(await cipher.encryptEncode()).toEqual('');

    expect(await cipher.decrypt(nonce, ciphertext)).toEqual(DATA);
    expect(
      await cipher.decryptEncoded(
        hexlify(cbor.encode({ ok: `0x${Buffer.from(DATA).toString('hex')}` })),
      ),
    ).toEqual(hexlify(DATA));
  });
});

describe('X25519DeoxysII', () => {
  it('key derivation', () => {
    // These test vectors are taken from `ts-web`.
    const secretKey = arrayify(
      '0xc07b151fbc1e7a11dff926111188f8d872f62eba0396da97c0a24adb75161750',
    );
    const keypair = nacl.box.keyPair.fromSecretKey(secretKey);
    const cipher = new X25519DeoxysII(keypair, keypair.publicKey);
    expect(hexlify(cipher.publicKey)).toEqual(
      '0x3046db3fa70ce605457dc47c48837ebd8bd0a26abfde5994d033e1ced68e2576',
    );
    expect(hexlify(cipher['key'])).toEqual(
      '0xe69ac21066a8c2284e8fdc690e579af4513547b9b31dd144792c1904b45cf586',
    );

    const alsoCipher = X25519DeoxysII.fromSecretKey(
      secretKey,
      keypair.publicKey,
    );
    expect(alsoCipher.publicKey).toEqual(cipher.publicKey);
  });

  it('roundtrip', async () => {
    const cipher = X25519DeoxysII.ephemeral(nacl.box.keyPair().publicKey);

    const { ciphertext, nonce } = await cipher.encrypt(DATA);
    expect(ciphertext).toHaveLength(DATA.length + TagSize);
    expect(ciphertext).not.toEqual(DATA);
    const plaintext = await cipher.decrypt(nonce, ciphertext);
    expect(plaintext).toEqual(DATA);

    const envelope = (await cipher.encryptEnvelope(DATA))!;
    expect(envelope.format).toEqual(1);
    if (!('nonce' in envelope.body)) throw new Error('unenveloped body');
    expect(envelope.body.pk).toEqual(cipher.publicKey);
    const resData = await cipher.encrypt(cbor.encode({ ok: DATA }));
    expect(
      await cipher.decryptCallResult({
        unknown: {
          nonce: resData.nonce,
          data: resData.ciphertext,
        },
      }),
    ).toEqual(DATA);
  });

  it('decryptCallData', async () => {
    const cipher = X25519DeoxysII.ephemeral(nacl.box.keyPair().publicKey);
    const envelope = (await cipher.encryptEnvelope(DATA))!;
    if (!('nonce' in envelope.body)) throw new Error('unenveloped body');
    const { data, nonce } = envelope.body;
    expect(await cipher.decryptCallData(nonce, data)).toEqual(DATA);
  });

  it('encryptCallResult', async () => {
    const cipher = X25519DeoxysII.ephemeral(nacl.box.keyPair().publicKey);
    const res = await cipher.encryptCallResult({ ok: DATA });
    expect(await cipher.decryptCallResult(cbor.decode(res))).toEqual(DATA);
  });
});

describe('lazy', () => {
  it('forwards', async () => {
    const inner = X25519DeoxysII.ephemeral(nacl.box.keyPair().publicKey);
    const cipher = lazy(() => inner);
    expect(await cipher.publicKey).toEqual(inner.publicKey);
    expect((await cipher.encrypt(DATA)).ciphertext).toHaveLength(
      DATA.length + TagSize,
    );
  });
});

describe('fetchPublicKeyByChainId', () => {
  async function expectFetch(
    chainId: Parameters<typeof fetchRuntimePublicKeyByChainId>[0],
    expectedUrl: string,
    opts?: Parameters<typeof fetchRuntimePublicKeyByChainId>[1],
  ): Promise<void> {
    const publicKey = nacl.box.keyPair().publicKey;
    const scope = nock(expectedUrl, {
      reqheaders: {
        'content-type': 'application/json',
      },
    })
      .post('/', (body) => {
        if (body.jsonrpc !== '2.0') return false;
        if (!Number.isInteger(parseInt(body.id, 10))) return false;
        if (body.method !== 'oasis_callDataPublicKey') return false;
        if (!Array.isArray(body.params) || body.params.length !== 0)
          return false;
        return true;
      })
      .reply(200, {
        result: {
          key: `0x${Buffer.from(publicKey).toString('hex')}`,
          // TODO: checksum and signature
        },
      });

    expect(await fetchRuntimePublicKeyByChainId(chainId, opts));

    scope.done();
  }

  it('fetches chainId', async () => {
    await expectFetch(0x5afe, 'https://sapphire.oasis.io');
    await expectFetch(0x5aff, 'https://testnet.sapphire.oasis.dev');
  });

  it('fetches chainId (fetch)', async () => {
    expectFetch(0x5afe, 'https://sapphire.oasis.io', {
      fetch: fetchImpl as unknown as typeof fetch,
    });
  });
});
