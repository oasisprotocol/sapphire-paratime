import { parse as parseTx } from '@ethersproject/transactions';
import * as cbor from 'cborg';
import * as ethers from 'ethers';

import { Mock as MockCipher } from '@oasislabs/sapphire-paratime/cipher.js';
import { wrap } from '@oasislabs/sapphire-paratime/compat.js';

import { CHAIN_ID, verifySignedCall } from './utils';

const wallet = new ethers.Wallet(
  '0x8160d68c4bf9425b1d3a14dc6d59a99d7d130428203042a8d419e68d626bd9f2',
);
const to = '0xb5ed90452AAC09f294a0BE877CBf2Dc4D55e096f';
const cipher = new MockCipher();
const data = Buffer.from([1, 2, 3, 4, 5]);

class MockProvider {
  public readonly _request: jest.Mock<
    Promise<unknown>,
    [{ method: string; params?: any[] }]
  >;
  public readonly isMetaMask = false;

  private readonly signer = wallet;

  public constructor() {
    this._request = jest.fn(async ({ method, params }) => {
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
          number: '0x1',
          parentHash: hash,
          timestamp: '0x6193ba2e',
        };
      if (method === 'eth_getTransactionCount') return '0x2';
      if (method === 'eth_call') {
        return ethers.utils.hexlify(
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
        const tx = ethers.utils.parseTransaction(params![0]);
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
        return wallet._signTypedData(domain, types, message);
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

class MockEIP1193Provider extends MockProvider {
  public readonly request: jest.Mock<
    Promise<unknown>,
    [{ method: string; params?: any[] }]
  >;

  public constructor() {
    super();
    this.request = this._request;
  }
}

class MockLegacyProvider extends MockProvider {
  public readonly send: (
    args: { id?: string | number; method: string; params?: any[] },
    cb: (err: unknown, ok?: unknown) => void,
  ) => void;

  public constructor() {
    super();
    this.send = (args, cb) => {
      this._request(args)
        .then((res: any) => {
          cb(null, { jsonrpc: '2.0', id: args.id, result: res });
        })
        .catch((err) => cb(err));
    };
  }
}

describe('ethers signer', () => {
  it('proxy', async () => {
    const wrapped = wrap(wallet, cipher);
    expect(wrapped.address).toEqual(
      '0x11e244400Cf165ade687077984F09c3A037b868F',
    );
    expect(await wrapped.getAddress()).toEqual(wrapped.address);
    expect((wrapped as any).sapphire).toMatchObject({ cipher });
  });

  it('sendRawTransaction un-enveloped', async () => {
    const upstreamProvider = new MockEIP1193Provider();
    const wrapped = wrap(wallet, cipher).connect(
      new ethers.providers.Web3Provider(upstreamProvider),
    );

    const raw = await wallet.signTransaction({
      to,
      data: `0x${data.toString('hex')}`,
    });
    await wrapped.provider!.sendTransaction(raw);
    const tx = ethers.utils.parseTransaction(
      upstreamProvider._request.mock.lastCall[0].params![0],
    );
    const txData = cbor.decode(ethers.utils.arrayify(tx.data));
    expect(txData.format).toEqual(cipher.kind);
    expect(ethers.utils.hexlify(txData.body.data)).toEqual(
      ethers.utils.hexlify(cbor.encode({ body: data })),
    );
  });

  runTestBattery(() => {
    const provider = new MockEIP1193Provider();
    const signer = wrap(wallet, cipher).connect(
      new ethers.providers.Web3Provider(provider),
    );
    return [signer, provider, signer.signTransaction.bind(signer)];
  });
});

describe('ethers provider', () => {
  let upstreamProvider: MockEIP1193Provider;
  let wrapped: ethers.providers.Provider;

  beforeEach(() => {
    upstreamProvider = new MockEIP1193Provider();
    const provider = new ethers.providers.Web3Provider(upstreamProvider);
    wrapped = wrap(provider, cipher);
  });

  it('proxy', async () => {
    expect(wrapped._isProvider).toBe(true);
    expect((wrapped as any).sapphire).toMatchObject({ cipher });
  });

  it('unsigned call/estimateGas', async () => {
    const callRequest = { to, data };
    const response = await wrapped.call(callRequest);
    expect(response).toEqual('0x112358');
    const encryptedCall = upstreamProvider._request.mock.lastCall[0].params![0];
    expect(encryptedCall.data).toEqual(
      await cipher.encryptEncode(callRequest.data),
    );

    const gasUsed = await wrapped.estimateGas(callRequest);
    expect(gasUsed.toNumber()).toEqual(0x112358);
  });

  it('real cipher', async () => {
    const provider = new ethers.providers.Web3Provider(upstreamProvider);
    const wrapped = wrap(provider); // no cipher!
    await wrapped.estimateGas({ to, data });
    upstreamProvider._request.mock.lastCall[0].params![0];
  });
});

describe('window.ethereum', () => {
  it('proxy', async () => {
    const wrapped = wrap(new MockEIP1193Provider(), cipher);
    expect(wrapped.isMetaMask).toBe(false);
    expect(wrapped.isConnected()).toBe(false);
    expect((wrapped as any).sapphire).toMatchObject({ cipher });
  });

  runTestBattery(() => {
    const provider = new MockEIP1193Provider();
    const wrapped = wrap(provider, cipher);
    const signer = new ethers.providers.Web3Provider(wrapped).getSigner();
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

  runTestBattery(() => {
    const provider = new MockLegacyProvider();
    const wrapped = wrap(provider, cipher);
    const signer = new ethers.providers.Web3Provider(wrapped).getSigner();
    const rawSign: ethers.Signer['signTransaction'] = async (
      ...args: unknown[]
    ) => {
      return new Promise((resolve, reject) => {
        wrapped.send(
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

function runTestBattery(
  makeSigner: () => [
    ethers.Signer,
    MockProvider, // this must not be proxied
    ethers.Signer['signTransaction'],
  ],
) {
  let wrapped: ethers.Signer;
  let upstreamProvider: MockProvider;
  let rawSign: ethers.Signer['signTransaction'];

  beforeEach(() => {
    [wrapped, upstreamProvider, rawSign] = makeSigner();
  });

  it('signTransaction balance transfer', async () => {
    const raw = await rawSign({ to, value: 42 });
    const tx = parseTx(raw);
    expect(tx.data).toEqual('0x');
    expect(tx.to).toEqual(to);
    expect(tx.value.toNumber()).toEqual(42);
  });

  it('signTransaction with data', async () => {
    const raw = await rawSign({
      to,
      value: 42,
      data: `0x${data.toString('hex')}`,
    });
    const tx = parseTx(raw);
    expect(tx.data).toEqual(await cipher.encryptEncode(data));
  });

  it('sendRawTransaction pre-enveloped', async () => {
    const raw = await wallet.signTransaction({
      to,
      data: cbor.encode({
        format: 42,
        body: {
          data: new Uint8Array([6]),
        },
      }),
    });
    await wrapped.provider!.sendTransaction(raw);
    const tx = ethers.utils.parseTransaction(
      upstreamProvider._request.mock.lastCall[0].params![0],
    );
    const txData = cbor.decode(ethers.utils.arrayify(tx.data));
    expect(txData.format).toEqual(42);
    expect(txData.body.data).toEqual(new Uint8Array([6]));
  });

  it('sendRawTransaction pre-enveloped bogus', async () => {
    const raw = await wallet.signTransaction({
      to,
      data: cbor.encode({
        something: 'definitely not right',
      }),
    });
    expect(wrapped.provider!.sendTransaction(raw)).rejects.toThrow(/bogus/i);
  });

  it('signed call/estimateGas', async () => {
    const from = await wrapped.getAddress();
    const callRequest = {
      from,
      to,
      data,
    };
    const response = await wrapped.call(callRequest);
    expect(response).toEqual('0x112358');
    const signedCall = upstreamProvider._request.mock.lastCall[0].params![0];
    await expect(verifySignedCall(signedCall, cipher)).resolves.not.toThrow();

    const gasUsed = await wrapped.estimateGas(callRequest);
    expect(gasUsed.toNumber()).toEqual(0x112358);
  });
}
