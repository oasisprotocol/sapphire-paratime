import * as cbor from 'cborg';
import { ethers } from 'ethers';

import {
  wrap,
  fetchRuntimePublicKey,
} from '@oasisprotocol/sapphire-paratime/compat.js';
import {
  Mock as MockCipher,
  fetchRuntimePublicKeyByChainId,
} from '@oasisprotocol/sapphire-paratime/cipher.js';
import { CHAIN_ID, verifySignedCall } from './utils';

const secretKey =
  '0x8160d68c4bf9425b1d3a14dc6d59a99d7d130428203042a8d419e68d626bd9f2';
const wallet = new ethers.Wallet(secretKey);
const to = '0xb5ed90452AAC09f294a0BE877CBf2Dc4D55e096f';
const cipher = new MockCipher();
const data = Buffer.from([1, 2, 3, 4, 5]);

jest.mock('@oasisprotocol/sapphire-paratime/cipher.js', () => ({
  ...jest.requireActual('@oasisprotocol/sapphire-paratime/cipher.js'),
  fetchRuntimePublicKeyByChainId: jest
    .fn()
    .mockReturnValue(new Uint8Array(Buffer.alloc(32, 8))),
}));

class MockEIP1193Provider {
  public readonly request: jest.Mock<
    Promise<unknown>,
    [{ method: string; params?: any[] }]
  >;

  public readonly isMetaMask = false;

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

class MockLegacyProvider extends MockEIP1193Provider {
  public readonly sendAsync: (
    args: { id?: string | number; method: string; params?: any[] },
    cb: (err: unknown, ok?: unknown) => void,
  ) => void;

  public constructor() {
    super();
    this.sendAsync = (args, cb) => {
      this.request(args)
        .then((res: any) => {
          cb(null, { jsonrpc: '2.0', id: args.id, result: res });
        })
        .catch((err) => cb(err));
    };
  }
}

class MockNonRuntimePublicKeyProvider extends MockEIP1193Provider {
  public readonly send: (args: {
    id?: string | number;
    method: string;
    params?: any[];
  }) => Promise<unknown>;

  public constructor() {
    super();
    this.send = (args) => {
      if (args.method == 'oasis_callDataPublicKey')
        throw new Error(`unhandled web3 call`);
      return this.request(args);
    };
  }
}

describe('fetchRuntimePublicKey', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('legacy metamask provider', async () => {
    const upstream = new ethers.BrowserProvider(new MockLegacyProvider());
    const pk = await fetchRuntimePublicKey(upstream);
    expect(fetchRuntimePublicKeyByChainId).not.toHaveBeenCalled();
    expect(pk).toEqual(new Uint8Array(Buffer.alloc(32, 42)));
  });

  it('ethers provider', async () => {
    const upstream = new ethers.BrowserProvider(new MockEIP1193Provider());
    const pk = await fetchRuntimePublicKey(upstream);
    expect(fetchRuntimePublicKeyByChainId).not.toHaveBeenCalled();
    expect(pk).toEqual(new Uint8Array(Buffer.alloc(32, 42)));
  });

  it('non public key provider', async () => {
    const pk = await fetchRuntimePublicKey(
      new MockNonRuntimePublicKeyProvider(),
    );
    expect(fetchRuntimePublicKeyByChainId).toHaveBeenCalled();
    expect(pk).toEqual(new Uint8Array(Buffer.alloc(32, 8)));
  });

  it('ethers signer', async () => {
    const wrapped = wrap(wallet, cipher).connect(
      new ethers.BrowserProvider(new MockEIP1193Provider()),
    );
    const pk = await fetchRuntimePublicKey(wrapped);
    expect(fetchRuntimePublicKeyByChainId).not.toHaveBeenCalled();
    expect(pk).toEqual(new Uint8Array(Buffer.alloc(32, 42)));
  });
});

describe('ethers signer', () => {
  it('proxy', async () => {
    const wrapped = wrap(wallet, cipher);
    expect(wrapped.address).toEqual(
      '0x11e244400Cf165ade687077984F09c3A037b868F',
    );
    expect(await wrapped.getAddress()).toEqual(wrapped.address);
    expect((wrapped as any).sapphire).toMatchObject({ cipher });
  });

  it('unsigned call/estimateGas', async () => {
    const upstreamProvider = new MockEIP1193Provider();
    const wrapped = wrap(wallet, cipher).connect(
      new ethers.BrowserProvider(upstreamProvider),
    );
    const callRequest = {
      from: null,
      to,
      data: ethers.hexlify(data),
    };

    const response = await wrapped.call(callRequest);
    expect(response).toEqual('0x112358');
    const encryptedCall = upstreamProvider.request.mock.calls[1][0].params![0];
    expect(encryptedCall.data).toEqual(
      await cipher.encryptEncode(callRequest.data),
    );

    const gasUsed = await wrapped.estimateGas(callRequest);
    expect(gasUsed).toEqual(BigInt(0x112358));
  });

  runTestBattery(async () => {
    const provider = new MockEIP1193Provider();
    const signer = wrap(wallet, cipher).connect(
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
    wrapped = wrap(provider, cipher);
  });

  it('proxy', async () => {
    expect((wrapped as any).sapphire).toMatchObject({ cipher });
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
    const upstreamProvider = new MockNonRuntimePublicKeyProvider();
    const provider = new ethers.BrowserProvider(upstreamProvider);
    const wrapped = wrap(provider); // no cipher!
    await wrapped.estimateGas({ to, data: ethers.hexlify(data) });
    expect(fetchRuntimePublicKeyByChainId).not.toHaveBeenCalled();
    upstreamProvider.request.mock.lastCall![0].params![0];
  });
});

describe('window.ethereum', () => {
  it('proxy', async () => {
    const wrapped = wrap(new MockEIP1193Provider(), cipher);
    expect(wrapped.isMetaMask).toBe(false);
    expect(wrapped.isConnected()).toBe(false);
    expect((wrapped as any).sapphire).toMatchObject({ cipher });
  });

  runTestBattery(async () => {
    const provider = new MockEIP1193Provider();
    const wrapped = wrap(provider, cipher);
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

describe('legacy MetaMask', () => {
  it('proxy', async () => {
    const wrapped = wrap(new MockLegacyProvider(), cipher);
    expect(wrapped.isMetaMask).toBe(false);
    expect(wrapped.isConnected()).toBe(false);
    expect((wrapped as any).sapphire).toMatchObject({ cipher });
  });

  runTestBattery(async () => {
    const provider = new MockLegacyProvider();
    const wrapped = wrap(provider, cipher);
    const signer = await new ethers.BrowserProvider(wrapped).getSigner();
    const rawSign: ethers.Signer['signTransaction'] = async (
      ...args: unknown[]
    ) => {
      return new Promise((resolve, reject) => {
        wrapped.sendAsync(
          {
            method: 'eth_signTransaction',
            params: args,
          },
          (err, ok) => {
            if (err) reject(err);
            else resolve((<any>ok).result as string);
          },
        );
      });
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
