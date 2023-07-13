import { Signer as AbstractSigner } from '@ethersproject/abstract-signer';
import { BigNumber } from '@ethersproject/bignumber';
import { arrayify, isBytesLike } from '@ethersproject/bytes';
import * as rlp from '@ethersproject/rlp';
import {
  BlockTag,
  JsonRpcProvider,
  JsonRpcSigner,
  Provider as AbstractProvider,
  TransactionRequest,
  Web3Provider,
} from '@ethersproject/providers';
import * as cbor from 'cborg';
import { ethers as ethers6 } from 'ethers6';
import { RequireAtLeastOne } from 'type-fest';

import {
  Cipher,
  Kind as CipherKind,
  X25519DeoxysII,
  fetchRuntimePublicKeyByChainId,
  lazy as lazyCipher,
} from './cipher.js';
import { CallError, OASIS_CALL_DATA_PUBLIC_KEY } from './index.js';
import { Ethers5CallSigner, SignedCallDataPack } from './signed_calls.js';

export type UpstreamProvider =
  | EIP1193Provider
  | AsyncSendProvider // legacy
  | Ethers5Signer
  | Ethers5Provider
  | ethers6.Signer
  | ethers6.Provider
  | HreProvider;

export type Ethers5Provider = Pick<
  AbstractProvider,
  'sendTransaction' | 'call' | 'estimateGas' | 'getNetwork'
>;

export type Ethers5Signer = Pick<
  AbstractSigner,
  'sendTransaction' | 'signTransaction' | 'call' | 'estimateGas' | 'getChainId'
> &
  Ethers5CallSigner & {
    connect(provider: Ethers5Provider): Ethers5Signer;
    provider?: Ethers5Provider;
  };

export type EIP1193Provider = {
  request: (args: Web3ReqArgs) => Promise<unknown>;
};

export type AsyncSendProvider<Args = Web3ReqArgs> = {
  send?: AsyncSend<Args>;
  sendAsync?: AsyncSend<Args>;
};

export type AsyncSend<Args = Web3ReqArgs> = (
  args: Args,
  cb: (err: any, ok?: any) => void,
) => void;

/** As found in `hre.network.provider`. */
export type HreProvider = RequireAtLeastOne<
  EIP1193Provider & {
    sendAsync: AsyncSend<Web3ReqArgs>;
    send: JsonRpcProvider['send'];
  }
>;

export type Web3ReqArgs = {
  readonly jsonrpc?: string;
  readonly id?: string | number;
  readonly method: string;
  readonly params?: any[];
};

export type StrictWeb3ReqArgs = {
  readonly jsonrpc: string;
  readonly id: number;
  readonly method: string;
  readonly params: any[];
};

const SAPPHIRE_PROP = 'sapphire';
export type SapphireAnnex = {
  [SAPPHIRE_PROP]: {
    cipher: Cipher;
  };
};

/** If a gas limit is not provided, the runtime will produce a very confusing error message, so we set a default limit. This one is very high, but solves the problem. This should be lowered once error messages are better or gas estimation is enabled. */
const DEFAULT_GAS = 10_000_000;

/**
 * Wraps an upstream ethers/web3/EIP-1193 provider to speak the Sapphire format.
 *
 * @param upstream The upstream web3 provider. Try something like one of the following:
 * ```
 * ethers.providers.Web3Provider(window.ethereum)
 * ethers.Wallet(privateKey)
 * ethers.getDefaultProvider(NETWORKS.testnet.defaultGateway)
 * web3.currentProvider
 * window.ethereum
 * a Web3 gateway URL
 * ```
 * @param customCipher An optional cipher to use for encrypting messages. If not provided an encrypting cipher will be chosen. This field is useful for providing a {@link cipher.Plain} cipher or using a custom public key for an encrypting cipher.
 */
export function wrap<P extends AsyncSendProvider<StrictWeb3ReqArgs>>( // Web3.js
  gatewayUrl: string | P,
  customCipher?: Cipher,
): EIP1193Provider & P & SapphireAnnex;
export function wrap<U extends UpstreamProvider>( // Ethers, `window.ethereum`
  upstream: U,
  customCipher?: Cipher,
): U & SapphireAnnex;
export function wrap<U extends UpstreamProvider>(
  upstream: U | string,
  customCipher?: Cipher,
): (U | (EIP1193Provider & AsyncSend)) & SapphireAnnex {
  // Already wrapped, so don't wrap it again.
  if (
    typeof upstream !== 'string' &&
    Reflect.get(upstream, SAPPHIRE_PROP) !== undefined
  ) {
    return upstream as U & SapphireAnnex;
  }

  if (typeof upstream === 'string') {
    const provider = new JsonRpcProvider(upstream);
    const cipher = customCipher ?? getCipher(provider);
    const request = hookExternalProvider(provider, cipher);
    const sendAsync = callbackify(request);
    return makeProxy(provider, cipher, {
      send: sendAsync,
      sendAsync,
      request,
    }) as unknown as EIP1193Provider & AsyncSend & SapphireAnnex;
  }

  const cipher = customCipher ?? getCipher(upstream);

  if (isEthers6Signer(upstream)) {
    let signer: ethers6.Signer;
    if (upstream.provider) {
      try {
        signer = upstream.connect(
          wrapEthers6Provider(upstream.provider, cipher, upstream),
        );
      } catch (e: any) {
        if (e.code !== 'UNSUPPORTED_OPERATION') throw e;
        signer = upstream;
      }
    } else {
      signer = upstream;
    }
    const hooks = {
      sendTransaction: hookEthers6Send(
        signer.sendTransaction.bind(signer),
        cipher,
      ),
      signTransaction: hookEthers6Send(
        signer.signTransaction.bind(signer),
        cipher,
      ),
      call: hookEthers6Call(signer, 'call', cipher),
      estimateGas: async () => BigInt(DEFAULT_GAS),
      connect(provider: ethers6.Provider) {
        return wrap(
          signer.connect(provider) as unknown as ethers6.Signer,
          cipher,
        );
      },
    } as Partial<ethers6.Signer>;
    return makeProxy(signer as any, cipher, hooks);
  }

  if (isEthers5Signer(upstream)) {
    let signer: Ethers5Signer;
    if (upstream.provider) {
      try {
        signer = upstream.connect(
          wrapEthers5Provider(upstream.provider, cipher, upstream),
        );
      } catch (e: any) {
        if (e.code !== 'UNSUPPORTED_OPERATION') throw e;
        signer = upstream;
      }
    } else {
      signer = upstream;
    }
    const hooks = {
      sendTransaction: hookEthers5Send(
        signer.sendTransaction.bind(signer),
        cipher,
      ),
      signTransaction: hookEthers5Send(
        signer.signTransaction.bind(signer),
        cipher,
      ),
      call: hookEthers5Call(signer, 'call', cipher),
      // TODO(#39): replace with original once resolved
      estimateGas: async () => BigNumber.from(DEFAULT_GAS),
      // estimateGas: hookEthersCall(
      //   signer.estimateGas.bind(signer),
      //   cipher,
      //   signer,
      // ),
      connect(provider: AbstractProvider) {
        return wrap(
          signer.connect(provider) as unknown as Ethers5Signer,
          cipher,
        );
      },
    } as Partial<Ethers5Signer>;
    return makeProxy(signer as any, cipher, hooks);
  }

  if (isEthers5Provider(upstream)) {
    return wrapEthers5Provider(upstream, cipher);
  }

  if (isEthers6Provider(upstream)) {
    return wrapEthers6Provider(upstream, cipher);
  }

  if ('request' in upstream || 'send' in upstream || 'sendAsync' in upstream) {
    const signer = makeWeb3Provider(upstream).getSigner();
    const request = hookExternalSigner(signer, cipher);
    const sendAsync = callbackify(request);
    let send: AsyncSend | JsonRpcProvider['send'] = sendAsync;
    if ('send' in upstream && isEthersSend(upstream.send)) {
      // If the provided `send` is an `JsonRpcProvider.send`, we need to provide that instead of the usual `AsyncSend`
      send = ((method, params) =>
        request({ method, params })) as JsonRpcProvider['send'];
    }
    return makeProxy(upstream, cipher, {
      request,
      send,
      sendAsync,
    });
  }

  throw new TypeError('Unable to wrap unsupported upstream signer.');
}

function isEthersSend(
  send?: AsyncSend | JsonRpcProvider['send'],
): send is JsonRpcProvider['send'] {
  if (!send) return false;
  // If the function is async, it's likely ethers send.
  try {
    const res = (send as any)(); // either rejects or calls back with an error
    if (res instanceof Promise) {
      res.catch(() => void {}); // handle the rejection before the next tick
      return true;
    }
  } catch {
    // This is prophyalictic. Neither kind of `send` should synchronously throw.
  }
  return false;
}

function getCipher(provider: UpstreamProvider): Cipher {
  return lazyCipher(async () => {
    const rtPubKey = await fetchRuntimePublicKey(provider);
    return X25519DeoxysII.ephemeral(rtPubKey);
  });
}

function makeProxy<U extends UpstreamProvider>(
  upstream: U,
  cipher: Cipher,
  hooks: Record<string, any>,
): U & SapphireAnnex {
  return new Proxy(upstream, {
    get(upstream, prop) {
      if (prop === SAPPHIRE_PROP) return { cipher };
      if (prop in hooks) return Reflect.get(hooks, prop);
      const value = Reflect.get(upstream, prop);
      return typeof value === 'function' ? value.bind(upstream) : value;
    },
  }) as U & SapphireAnnex;
}

function wrapEthers5Provider<P extends Ethers5Provider>(
  provider: P,
  cipher: Cipher,
  signer?: Ethers5Signer,
): P & SapphireAnnex {
  // Already wrapped, so don't wrap it again.
  if (Reflect.get(provider, SAPPHIRE_PROP) !== undefined) {
    return provider as P & SapphireAnnex;
  }

  // If a signer is provided it's because this method was invoked by wrapping a signer,
  // so the `call` and `estimateGas` methods are already hooked.
  const hooks = signer
    ? {
        sendTransaction: <AbstractProvider['sendTransaction']>(async (raw) => {
          const repacked = await repackRawTx(await raw, cipher, signer);
          return provider.sendTransaction(repacked);
        }),
      }
    : {
        // Calls can be unsigned, but must be enveloped.
        call: hookEthers5Call(provider, 'call', cipher),
        estimateGas: hookEthers5Call(provider, 'estimateGas', cipher),
      };
  return makeProxy(provider, cipher, hooks);
}

function wrapEthers6Provider<P extends ethers6.Provider>(
  provider: P,
  cipher: Cipher,
  signer?: ethers6.Signer,
): P & SapphireAnnex {
  // Already wrapped, so don't wrap it again.
  if (Reflect.get(provider, SAPPHIRE_PROP) !== undefined) {
    return provider as P & SapphireAnnex;
  }

  const hooks = signer
    ? {}
    : {
        // Calls can be unsigned, but must be enveloped.
        call: hookEthers6Call(provider, 'call', cipher),
        estimateGas: hookEthers6Call(provider, 'estimateGas', cipher),
      };
  return makeProxy(provider, cipher, hooks);
}

function isEthers5Provider(upstream: unknown): upstream is Ethers5Provider {
  return AbstractProvider.isProvider(upstream);
}

function isEthers5Signer(upstream: unknown): upstream is Ethers5Signer {
  return AbstractSigner.isSigner(upstream) && '_signTypedData' in upstream;
}

function isEthers6Signer(upstream: unknown): upstream is ethers6.Signer {
  return upstream instanceof ethers6.AbstractSigner;
}

function isEthers6Provider(upstream: unknown): upstream is ethers6.Provider {
  return upstream instanceof ethers6.AbstractProvider;
}

function hookEthers5Call(
  runner: Ethers5Signer | Ethers5Provider,
  method: 'call' | 'estimateGas',
  cipher: Cipher,
): Ethers5Call {
  const sendUnsignedCall = async (
    provider: Ethers5Provider,
    callP: Deferrable<TransactionRequest>,
    blockTag?: BlockTag,
  ) => {
    return provider[method](
      {
        ...callP,
        data: cipher.encryptEncode(await callP.data),
      },
      blockTag,
    );
  };
  return async (callP, blockTag?: BlockTag) => {
    let res: string | BigNumber;
    if (isEthers5Signer(runner)) {
      const signer = runner;
      if (await callNeedsSigning(callP)) {
        const dataPack = await SignedCallDataPack.make(
          (await undefer(callP)) as any /* callNeedsSigning ensures type */,
          signer,
        );
        res = await signer[method](
          {
            ...callP,
            data: dataPack.encryptEncode(cipher),
          },
          blockTag,
        );
      } else {
        if (!signer.provider) throw new Error('unable to sign call');
        res = await sendUnsignedCall(signer.provider, callP, blockTag);
      }
    } else {
      res = await sendUnsignedCall(runner, callP, blockTag);
    }
    if (typeof res === 'string') return cipher.decryptEncoded(res);
    return res;
  };
}

function hookEthers6Call(
  runner: ethers6.ContractRunner,
  method: 'call' | 'estimateGas',
  cipher: Cipher,
): Ethers6Call | undefined {
  const sendUnsignedCall = async (
    runner: ethers6.ContractRunner,
    call: ethers6.TransactionRequest,
  ) => {
    return runner[method]!({
      ...call,
      data: await cipher.encryptEncode(call.data ?? new Uint8Array()),
    });
  };
  return async (call) => {
    let res: string | bigint | ethers6.TransactionResponse;
    if (isEthers6Signer(runner)) {
      const signer = runner;
      if (!signer.provider)
        throw new Error('signer not connected to a provider');
      const provider = signer.provider;
      if (await callNeedsSigning(call)) {
        const dataPack = await SignedCallDataPack.make(
          (await undefer(call)) as any /* callNeedsSigning ensures type */,
          signer,
        );
        res = await provider[method]({
          ...call,
          data: await dataPack.encryptEncode(cipher),
        });
      } else {
        res = await sendUnsignedCall(provider, call);
      }
    } else {
      res = await sendUnsignedCall(runner, call);
    }
    if (typeof res === 'string') return cipher.decryptEncoded(res);
    return res;
  };
}

function hookEthers5Send(send: Ethers5Call, cipher: Cipher): Ethers5Call {
  return async (tx: Deferrable<TransactionRequest>, ...rest) => {
    const data = await tx.data;
    tx.data = cipher.encryptEncode(data);
    if (!tx.gasLimit) tx.gasLimit = DEFAULT_GAS;
    return send(tx, ...rest);
  };
}

function hookEthers6Send(send: Ethers6Call, cipher: Cipher): Ethers6Call {
  return async (tx: ethers6.TransactionRequest, ...rest) => {
    if (tx.data) tx.data = await cipher.encryptEncode(tx.data);
    if (!tx.gasLimit) tx.gasLimit = DEFAULT_GAS;
    return send(tx, ...rest);
  };
}

async function callNeedsSigning(
  callP: Deferrable<TransactionRequest> | ethers6.TransactionRequest,
): Promise<boolean> {
  const [from, to] = await Promise.all([callP.from, callP.to]);
  return (
    !!to && !!from && typeof from === 'string' && !/^(0x)?0{40}$/.test(from)
  );
}

type Ethers5Call = (
  tx: Deferrable<TransactionRequest>,
  blockTag?: BlockTag,
) => Promise<unknown>;

type Ethers6Call = (tx: ethers6.TransactionRequest) => Promise<unknown>;

type Deferrable<T> = {
  [K in keyof T]: T[K] | Promise<T[K]>;
};

async function undefer<T>(obj: Deferrable<T>): Promise<T> {
  return Object.fromEntries(
    await Promise.all(Object.entries(obj).map(async ([k, v]) => [k, await v])),
  );
}

function hookExternalSigner(
  signer: JsonRpcSigner,
  cipher: Cipher,
): EIP1193Provider['request'] {
  return async (args: Web3ReqArgs) => {
    if (args.method === 'eth_estimateGas')
      return BigNumber.from(DEFAULT_GAS).toHexString(); // TODO(#39)
    const { method, params } = await prepareRequest(args, signer, cipher);
    const res = await signer.provider.send(method, params ?? []);
    if (method === 'eth_call') return cipher.decryptEncoded(res);
    return res;
  };
}

function hookExternalProvider(
  provider: JsonRpcProvider,
  cipher: Cipher,
): EIP1193Provider['request'] {
  return async ({ method, params }: Web3ReqArgs) => {
    if (method === 'eth_estimateGas')
      return BigNumber.from(DEFAULT_GAS).toHexString(); // TODO(#39)
    if (method === 'eth_call' && params) {
      params[0].data = await cipher.encryptEncode(params[0].data);
      if (!params[0].gasLimit) params[0].gasLimit = DEFAULT_GAS;
      return provider.send(method, params);
    }
    return provider.send(method, params ?? []);
  };
}

function callbackify(request: EIP1193Provider['request']) {
  return (args: Web3ReqArgs, cb: (err: unknown, ok?: unknown) => void) => {
    request(args)
      .then((res) => cb(null, { jsonrpc: '2.0', id: args.id, result: res }))
      .catch((err) => cb(err));
  };
}

async function prepareRequest(
  { method, params }: Web3ReqArgs,
  signer: JsonRpcSigner,
  cipher: Cipher,
): Promise<{ method: string; params?: unknown[] }> {
  if (!Array.isArray(params)) return { method, params };

  if (method === 'eth_sendRawTransaction') {
    return {
      method,
      params: [await repackRawTx(params[0], cipher, signer)],
    };
  }

  if (
    (method === 'eth_call' || method === 'eth_estimateGas') &&
    (await callNeedsSigning(params[0]))
  ) {
    const dataPack = await SignedCallDataPack.make(params[0], signer);
    const signedCall = {
      ...params[0],
      data: await dataPack.encryptEncode(cipher),
    };
    return {
      method,
      params: [signedCall, ...params.slice(1)],
    };
  }

  if (/^eth_((send|sign)Transaction|call|estimateGas)$/.test(method)) {
    params[0].data = await cipher.encryptEncode(params[0].data);
    if (!params[0].gasLimit) params[0].gasLimit = DEFAULT_GAS;
    return { method, params };
  }

  return { method, params };
}

const REPACK_ERROR =
  'Un-enveloped data was passed to sendRawTransaction, which is likely incorrect. Is the dapp using the Sapphire compat lib correctly?';

/** Repacks and signs a sendRawTransaction if needed and possible. */
async function repackRawTx(
  raw: string,
  cipher: Cipher,
  signer?: Ethers5Signer | ethers6.Signer,
): Promise<string> {
  const DATA_FIELD = 5;
  const txFields = rlp.decode(raw);
  const data = arrayify(txFields[DATA_FIELD], { allowMissingPrefix: true });
  try {
    const { format, body, ...extra } = cbor.decode(data);
    if (envelopeFormatOk(format, body, extra)) return raw;
    throw new EnvelopeError(
      'Bogus enveloped data found in sendRawTransaction.',
    );
  } catch (e) {
    if (e instanceof EnvelopeError) throw e;
    if (globalThis?.process?.env?.NODE_ENV !== 'test') {
      console.trace(REPACK_ERROR);
    }
  }
  const tx = ethers6.Transaction.from(raw);
  const q = (v: bigint | null | undefined): string | undefined => {
    if (!v) return undefined;
    return ethers6.toQuantity(v);
  };
  const parsed = {
    to: tx.to!,
    from: tx.from!,
    data: tx.data,
    nonce: tx.nonce,
    gasLimit: q(tx.gasLimit),
    gasPrice: q(tx.gasPrice) ?? undefined,
    value: q(tx.value),
    chainId: Number(tx.chainId),
  };
  if (!signer) throw new CallError(REPACK_ERROR, null);
  if (!parsed.gasLimit) parsed.gasLimit = q(BigInt(DEFAULT_GAS)); // TODO(39)
  try {
    return signer.signTransaction({
      ...parsed,
      data: await cipher.encryptEncode(data),
    });
  } catch (e) {
    throw new CallError(REPACK_ERROR, e);
  }
}

function envelopeFormatOk(
  format: CipherKind | undefined,
  body: Uint8Array | Record<string, Uint8Array> | undefined,
  extra: Record<string, any>,
): boolean {
  if (Object.keys(extra).length > 0) return false;
  if (!body) return false;
  if (format && format !== CipherKind.Plain) {
    if (isBytesLike(body) || !isBytesLike(body.data)) return false;
  }
  return true;
}

class EnvelopeError extends Error {}

function defer<T>() {
  const deferred: {
    promise?: Promise<T>;
    resolve?: (value: T | PromiseLike<T>) => void;
    reject?: (reason?: any) => void;
  } = {};
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });
  return deferred;
}

/**
 * Picks the most user-trusted runtime calldata public key source based on what
 * connections are available.
 * Note: MetaMask does not support Web3 methods it doesn't know about, so we have to
 * fall back to manually querying the default gateway.
 */
export async function fetchRuntimePublicKey(
  upstream: UpstreamProvider,
): Promise<Uint8Array> {
  const isEthersSigner = isEthers5Signer(upstream) || isEthers6Signer(upstream);
  const provider = isEthersSigner ? upstream['provider'] : upstream;
  if (provider && 'send' in provider) {
    // first opportunistically try `send` from the provider
    try {
      const source = provider as {
        send: (
          method: string | { method: string; params: any[] },
          params?: any[] | ((err: any, ok?: any) => void),
        ) => Promise<any> | void;
      };

      // For Truffle, turn a callback into an synchronous call
      const deferred = defer<any>();
      const truffle_callback = function (err: any, ok?: any) {
        if (ok) {
          deferred.resolve!(ok.result);
        }
        deferred.reject!(err);
        return;
      };

      let resp;
      if (
        !isEthersSigner &&
        !isEthers5Provider(provider) &&
        !isEthers6Provider(provider)
      ) {
        // Truffle HDWallet-Provider and EIP-1193 accept {method:,params:} dict
        resp = await source.send(
          { method: OASIS_CALL_DATA_PUBLIC_KEY, params: [] },
          truffle_callback,
        );
        if (resp === undefined) {
          // Truffle HDWallet-provider uses a callback instead of returning a promise
          resp = await deferred.promise;
          if (resp === undefined) {
            throw Error(
              'Got unexpected `undefined` from source.send callback!',
            );
          }
        } else {
          // Otherwise, EIP-1193 compatible provider will have returned `result` key from promise
        }
      } else {
        // Whereas Ethers accepts (method,params)
        resp = await source.send(OASIS_CALL_DATA_PUBLIC_KEY, []);
      }

      if ('key' in resp) {
        const key = resp.key;
        return arrayify(key);
      }
    } catch (ex) {
      // don't do anything, move on to try chainId
    }
  }

  if (isEthers5Provider(upstream) || isEthers6Provider(upstream)) {
    const chainId = Number((await upstream.getNetwork()).chainId);
    return fetchRuntimePublicKeyByChainId(chainId);
  }

  if (isEthersSigner) {
    const chainId = Number((await upstream.provider!.getNetwork()).chainId);
    return fetchRuntimePublicKeyByChainId(chainId);
  }

  const chainId = (await makeWeb3Provider(upstream).getNetwork()).chainId;
  return fetchRuntimePublicKeyByChainId(chainId);
}

function makeWeb3Provider(
  upstream: EIP1193Provider | AsyncSendProvider | HreProvider,
): Web3Provider {
  let provider: EIP1193Provider | AsyncSendProvider;
  if ('send' in upstream && isEthersSend(upstream.send)) {
    provider = {
      request: ({ method, params }) =>
        (upstream.send as JsonRpcProvider['send'])(method, params ?? []),
    } as EIP1193Provider;
  } else {
    provider = upstream as EIP1193Provider | AsyncSendProvider;
  }
  return new Web3Provider(provider);
}
