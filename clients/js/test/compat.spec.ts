import * as cbor from 'cborg';
import { ethers } from 'ethers';
import nock from 'nock';
import fetchImpl from 'node-fetch';
import nacl from 'tweetnacl';

import { wrap } from '@oasisprotocol/sapphire-paratime/compat.js';

import {
  MockKeyFetcher,
  fetchRuntimePublicKey,
  fetchRuntimePublicKeyByChainId,
} from '@oasisprotocol/sapphire-paratime/calldatapublickey.js';
import { Mock as MockCipher } from '@oasisprotocol/sapphire-paratime/cipher.js';
import { CHAIN_ID, verifySignedCall } from './utils';

jest.mock('@oasisprotocol/sapphire-paratime/calldatapublickey.js', () => ({
  ...jest.requireActual(
    '@oasisprotocol/sapphire-paratime/calldatapublickey.js',
  ),
  fetchRuntimePublicKeyByChainId: jest
    .fn()
    .mockReturnValue(new Uint8Array(Buffer.alloc(32, 8))),
}));

const real_fetchRuntimePublicKeyByChainId = jest.requireActual(
  '@oasisprotocol/sapphire-paratime/calldatapublickey.js',
).fetchRuntimePublicKeyByChainId;

const secretKey =
  '0x8160d68c4bf9425b1d3a14dc6d59a99d7d130428203042a8d419e68d626bd9f2';
const wallet = new ethers.Wallet(secretKey);
const to = '0xb5ed90452AAC09f294a0BE877CBf2Dc4D55e096f';
const cipher = new MockCipher();
const fetcher = new MockKeyFetcher(cipher);
const data = Buffer.from([1, 2, 3, 4, 5]);

class MockEIP1193Provider {
  public readonly request: jest.Mock<
    Promise<unknown>,
    [
      {
        id?: string | number;
        method: string;
        params?: any[];
      },
    ]
  >;

  public readonly isMetaMask: boolean = false;

  private readonly signer = wallet;

  public constructor() {
    this.request = jest.fn(async ({ method, params }) => {
      const hash =
        '0x5dbc9f2c9579671b8ab359acd7b370603e7c056442305e1f2b71741c90cbd046';
      if (method === 'eth_chainId') return CHAIN_ID;
      if (method === 'eth_blockNumber') return '0x05';
      if (method === 'eth_getBlockByNumber')
        return {
          extraData: '0x',
          gasLimit: '0x1406f40',
          gasUsed: '0x0',
          hash,
          difficulty: '0x0',
          transactions: [],
          number: '0x1',
          parentHash: hash,
          timestamp: '0x6193ba2e',
        };
      if (method === 'eth_getTransactionCount') return '0x2';
      if (method === 'eth_call') {
        return ethers.hexlify(
          cbor.encode({
            unknown: {
              nonce: MockCipher.NONCE,
              data: cbor.encode({ ok: new Uint8Array([0x11, 0x23, 0x58]) }),
            },
          }),
        );
      }
      if (method === 'eth_estimateGas') return '0x112358';
      if (method === 'eth_sendRawTransaction') {
        const tx = ethers.Transaction.from(params![0]);
        return tx.hash;
      }
      if (method === 'eth_signTransaction') {
        return this.signer.signTransaction(params![0]);
      }
      if (method === 'eth_accounts') {
        return [await this.signer.getAddress()];
      }
      if (method === 'eth_signTypedData_v4') {
        const { domain, types, message } = JSON.parse(params![1]);
        delete types['EIP712Domain'];
        return wallet.signTypedData(domain, types, message);
      }
      if (method === 'oasis_callDataPublicKey') {
        return {
          key: `0x${Buffer.alloc(32, 42).toString('hex')}`,
          checksum: '0x',
          epoch: 1,
          signature: '0x',
          chainId: CHAIN_ID,
        };
      }
      throw new Error(
        `unhandled web3 call for ${method} with params ${params}`,
      );
    });
  }

  public isConnected(): boolean {
    return false;
  }
}

class MockNonRuntimePublicKeyProvider {
  public readonly request: jest.Mock<
    Promise<unknown>,
    [
      {
        id?: string | number;
        method: string;
        params?: any[];
      },
    ]
  >;

  public constructor() {
    this.request = jest.fn((args) => {
      // Always errors while requesting the calldata public key
      // This simulates, e.g. MetaMask, which doesn't allow arbitrary requests
      if (args.method === 'oasis_callDataPublicKey') {
        throw new Error(`unhandled web3 call`);
      }
      return new MockEIP1193Provider().request(args);
    });
  }
}

describe('fetchRuntimePublicKey', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('ethers provider', async () => {
    const upstream = new ethers.BrowserProvider(new MockEIP1193Provider());
    const pk = await fetchRuntimePublicKey(upstream);
    expect(fetchRuntimePublicKeyByChainId).not.toHaveBeenCalled();
    expect(pk.key).toEqual(new Uint8Array(Buffer.alloc(32, 42)));
  });

  it('non public key provider', async () => {
    const pk = await fetchRuntimePublicKey(
      new MockNonRuntimePublicKeyProvider(),
    );
    // This will have retrieved the key from testnet or mainnet
    expect(pk.key).not.toEqual(new Uint8Array(Buffer.alloc(32, 8)));
  });

  it('ethers signer', async () => {
    const wrapped = wrap(wallet, { fetcher: fetcher }).connect(
      new ethers.BrowserProvider(new MockEIP1193Provider()),
    );
    const pk = await fetchRuntimePublicKey(wrapped);
    expect(fetchRuntimePublicKeyByChainId).not.toHaveBeenCalled();
    expect(pk.key).toEqual(new Uint8Array(Buffer.alloc(32, 42)));
  });
});

describe('ethers signer', () => {
  it('proxy', async () => {
    const wrapped = wrap(wallet, { fetcher });
    expect(wrapped.address).toEqual(
      '0x11e244400Cf165ade687077984F09c3A037b868F',
    );
    expect(await wrapped.getAddress()).toEqual(wrapped.address);
    expect((wrapped as any).sapphire).toMatchObject({ fetcher });
  });

  it('unsigned call/estimateGas', async () => {
    const upstreamProvider = new MockEIP1193Provider();
    const wrapped = wrap(wallet, { fetcher }).connect(
      new ethers.BrowserProvider(upstreamProvider),
    );
    const callRequest = {
      from: null,
      to,
      data: ethers.hexlify(data),
    };

    const response = await wrapped.call(callRequest);
    expect(response).toEqual('0x112358');

    const y = upstreamProvider.request.mock.calls.find(
      (z) => z[0].method === 'eth_call',
    )![0];

    // This will be a signed view call, so it will be enveloped
    // Make sure that the view call is enveloped, and can be decrypted
    const decryptedBody = cbor.decode(ethers.getBytes(y.params![0].data));
    expect(decryptedBody.leash).toBeDefined();
    expect(decryptedBody.signature).toBeDefined();
    const decryptedInnerBody = await cipher.decryptCallData(
      decryptedBody.data.body.nonce,
      decryptedBody.data.body.data,
    );
    expect(ethers.hexlify(decryptedInnerBody)).toEqual(callRequest.data);

    const gasUsed = await wrapped.estimateGas(callRequest);
    expect(gasUsed).toEqual(BigInt(0x112358));
  });

  runTestBattery(async () => {
    const provider = new MockEIP1193Provider();
    const signer = wrap(wallet, { fetcher }).connect(
      new ethers.BrowserProvider(provider),
    );
    return [signer, provider, signer.signTransaction.bind(signer)];
  });
});

describe('ethers provider', () => {
  let upstreamProvider: MockEIP1193Provider;
  let wrapped: ethers.Provider;

  beforeEach(() => {
    upstreamProvider = new MockEIP1193Provider();
    const provider = new ethers.BrowserProvider(upstreamProvider);
    wrapped = wrap(provider, { fetcher });
  });

  it('proxy', async () => {
    expect((wrapped as any).sapphire).toMatchObject({ fetcher });
  });

  it('unsigned call/estimateGas', async () => {
    const callRequest = { to, data: ethers.hexlify(data) };
    const response = await wrapped.call({
      ...callRequest,
      blockTag: 'pending',
    });
    expect(response).toEqual('0x112358');
    const [{ data: latestData }, pendingTag] =
      upstreamProvider.request.mock.calls[1][0].params!;
    expect(latestData).toEqual(await cipher.encryptEncode(callRequest.data));
    expect(pendingTag).toEqual('pending');

    const gasUsed = await wrapped.estimateGas(callRequest);
    expect(gasUsed).toEqual(BigInt(0x112358));
  });

  it('real cipher', async () => {
    jest.clearAllMocks();
    const provider = new ethers.BrowserProvider(upstreamProvider);
    const wrapped = wrap(provider); // no cipher!
    await wrapped.estimateGas({ to, data: ethers.hexlify(data) });
    expect(fetchRuntimePublicKeyByChainId).not.toHaveBeenCalled();
  });
});

describe('window.ethereum', () => {
  it('proxy', async () => {
    const wrapped = wrap(new MockEIP1193Provider(), { fetcher });
    expect(wrapped.isMetaMask).toBe(false);
    expect(wrapped.isConnected()).toBe(false);
    expect((wrapped as any).sapphire).toMatchObject({ fetcher });
  });

  runTestBattery(async () => {
    const provider = new MockEIP1193Provider();
    const wrapped = wrap(provider, { fetcher });
    const signer = await new ethers.BrowserProvider(wrapped).getSigner();
    const rawSign = async (...args: unknown[]) => {
      const raw = await wrapped.request({
        method: 'eth_signTransaction',
        params: args,
      });
      return raw as string;
    };
    return [signer, provider, rawSign];
  });
});

function runTestBattery<S extends ethers.Signer>(
  makeSigner: () => Promise<
    [
      S,
      MockEIP1193Provider, // this must not be proxied
      S['signTransaction'],
    ]
  >,
) {
  let wrapped: S;
  let upstreamProvider: MockEIP1193Provider;
  let rawSign: S['signTransaction'];

  beforeEach(async () => {
    [wrapped, upstreamProvider, rawSign] = await makeSigner();
  });

  it('signTransaction balance transfer', async () => {
    const raw = await rawSign({ to, value: 42 });
    const tx = ethers.Transaction.from(raw);
    expect(tx.data).toEqual('0x');
    expect(tx.to).toEqual(to);
    expect(tx.value).toEqual(BigInt(42));
  });

  it('signTransaction with data', async () => {
    const raw = await rawSign({
      to,
      value: 42,
      data: ethers.hexlify(data),
    });
    const tx = ethers.Transaction.from(raw);
    expect(tx.data).toEqual(await cipher.encryptEncode(data));
  });

  it('sendRawTransaction pre-enveloped', async () => {
    if (!wrapped?.provider?.sendTransaction) return;
    const raw = await wallet.signTransaction({
      to,
      data: cbor
        .encode({
          format: 42,
          body: {
            data: new Uint8Array([6]),
          },
        })
        .toString(),
    });
    await wrapped.provider!.sendTransaction(ethers.Transaction.from(raw));
    const tx = ethers.Transaction.from(
      upstreamProvider.request.mock.lastCall![0].params![0],
    );
    const txData = cbor.decode(ethers.getBytes(tx.data));
    expect(txData.format).toEqual(42);
    expect(txData.body.data).toEqual(new Uint8Array([6]));
  });

  it('sendRawTransaction pre-enveloped bogus', async () => {
    if (!wrapped?.provider?.sendTransaction) return;
    const raw = await wallet.signTransaction({
      to,
      data: cbor
        .encode({
          something: 'definitely not right',
        })
        .toString(),
    });
    expect(
      wrapped.provider!.sendTransaction(ethers.Transaction.from(raw)),
    ).rejects.toThrow(/bogus/i);
  });

  it('signed call/estimateGas', async () => {
    const from = await wrapped.getAddress();
    const callRequest = {
      from,
      to,
      data: ethers.hexlify(data),
    };
    const response = await wrapped.call(callRequest);
    expect(response).toEqual('0x112358');
    const calls = upstreamProvider.request.mock.calls;
    let signedCall: any;
    for (let i = calls.length - 1; i >= 0; i--) {
      if (calls[i][0].method === 'eth_call') {
        signedCall = calls[i][0].params![0];
        break;
      }
    }
    await expect(verifySignedCall(signedCall, cipher)).resolves.not.toThrow();

    const gasUsed = await wrapped.estimateGas(callRequest);
    expect(gasUsed).toEqual(BigInt(0x112358));
  });
}

describe('fetchPublicKeyByChainId', () => {
  async function expectFetch(
    chainId: Parameters<typeof fetchRuntimePublicKeyByChainId>[0],
    expectedUrl: string,
    opts?: Parameters<typeof fetchRuntimePublicKeyByChainId>[1],
  ): Promise<void> {
    const publicKey = nacl.box.keyPair().publicKey;
    const scope = nock(expectedUrl, {
      reqheaders: {
        'Content-Type': 'application/json',
      },
    })
      .post('/', (body) => {
        if (body.jsonrpc !== '2.0') {
          return false;
        }
        if (!Number.isInteger(parseInt(body.id, 10))) {
          return false;
        }
        if (body.method !== 'oasis_callDataPublicKey') {
          return false;
        }
        if (!Array.isArray(body.params) || body.params.length !== 0) {
          return false;
        }
        return true;
      })
      .reply(200, {
        result: {
          key: `0x${Buffer.from(publicKey).toString('hex')}`,
          checksum: '0x',
          epoch: 1,
          signature: '0x',
          chainId: CHAIN_ID,
        },
      });

    const response = await real_fetchRuntimePublicKeyByChainId(chainId, opts);
    expect(response.key).not.toHaveLength(0);

    scope.done();
  }

  it('fetches chainId', async () => {
    await expectFetch(0x5afe, 'https://sapphire.oasis.io', {
      fetch: fetchImpl as unknown as typeof fetch,
    });
    await expectFetch(0x5aff, 'https://testnet.sapphire.oasis.dev', {
      fetch: fetchImpl as unknown as typeof fetch,
    });
  });

  it('fetches chainId (fetch)', async () => {
    await expectFetch(0x5afe, 'https://sapphire.oasis.io', {
      fetch: fetchImpl as unknown as typeof fetch,
    });
  });
});
