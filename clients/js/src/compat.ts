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
import { parse as parseTx } from '@ethersproject/transactions';
import * as cbor from 'cborg';
import { RequireAtLeastOne } from 'type-fest';

import {
  Cipher,
  Kind as CipherKind,
  X25519DeoxysII,
  fetchRuntimePublicKeyByChainId,
  lazy as lazyCipher,
} from './cipher.js';
import { CallError, OASIS_CALL_DATA_PUBLIC_KEY } from './index.js';
import {
  EthCall,
  SignedCallDataPack,
  Signer as SignedCallSigner,
} from './signed_calls.js';

export type UpstreamProvider =
  | EIP1193Provider
  | AsyncSendProvider // legacy
  | EthersSigner
  | EthersProvider
  | HreProvider;

export type EthersProvider = Pick<
  AbstractProvider,
  'sendTransaction' | 'call' | 'estimateGas' | 'getNetwork'
>;

export type EthersSigner = Pick<
  AbstractSigner,
  'sendTransaction' | 'signTransaction' | 'call' | 'estimateGas' | 'getChainId'
> &
  SignedCallSigner & {
    connect(provider: EthersProvider): EthersSigner;
    provider?: EthersProvider;
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

  if (isEthersSigner(upstream)) {
    let signer: EthersSigner;
    if (upstream.provider) {
      try {
        signer = upstream.connect(
          wrapEthersProvider(upstream.provider, cipher, upstream),
        );
      } catch (e: any) {
        if (e.code !== 'UNSUPPORTED_OPERATION') throw e;
        signer = upstream;
      }
    } else {
      signer = upstream;
    }
    const hooks = {
      sendTransaction: hookEthersSend(
        signer.sendTransaction.bind(signer),
        cipher,
      ),
      signTransaction: hookEthersSend(
        signer.signTransaction.bind(signer),
        cipher,
      ),
      call: hookEthersCall(signer, 'call', cipher),
      // TODO(#39): replace with original once resolved
      estimateGas: () => DEFAULT_GAS,
      // estimateGas: hookEthersCall(
      //   signer.estimateGas.bind(signer),
      //   cipher,
      //   signer,
      // ),
      connect(provider: AbstractProvider) {
        return wrap(
          signer.connect(provider) as unknown as EthersSigner,
          cipher,
        );
      },
    };
    return makeProxy(signer as any, cipher, hooks);
  }

  if (isEthersProvider(upstream)) {
    return wrapEthersProvider(upstream, cipher);
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
  hooks: { [key: string | symbol]: any },
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

function wrapEthersProvider<P extends EthersProvider>(
  provider: P,
  cipher: Cipher,
  signer?: EthersSigner,
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
        call: hookEthersCall(provider, 'call', cipher),
        estimateGas: hookEthersCall(provider, 'estimateGas', cipher),
      };
  return makeProxy(provider, cipher, hooks);
}

function isEthersProvider(upstream: unknown): upstream is EthersProvider {
  return AbstractProvider.isProvider(upstream);
}

function isEthersSigner(upstream: unknown): upstream is EthersSigner {
  return AbstractSigner.isSigner(upstream) && '_signTypedData' in upstream;
}

function hookEthersCall(
  signerOrProvider: EthersSigner | EthersProvider,
  method: 'call' | 'estimateGas',
  cipher: Cipher,
): EthersCall {
  const sendUnsignedCall = async (
    provider: EthersProvider,
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
    if (isEthersSigner(signerOrProvider)) {
      const signer = signerOrProvider;
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
        if (signer._checkProvider) signer._checkProvider(method);
        res = await sendUnsignedCall(signer.provider!, callP, blockTag);
      }
    } else {
      const provider = signerOrProvider;
      res = await sendUnsignedCall(provider, callP, blockTag);
    }
    if (typeof res === 'string') return cipher.decryptEncoded(res);
    return res;
  };
}

function hookEthersSend(send: EthersCall, cipher: Cipher): EthersCall {
  return async (tx: Deferrable<TransactionRequest>, ...rest) => {
    const data = await tx.data;
    tx.data = cipher.encryptEncode(data);
    if (!tx.gasLimit) tx.gasLimit = DEFAULT_GAS;
    return send(tx, ...rest);
  };
}

async function callNeedsSigning(
  callP: Deferrable<TransactionRequest>,
): Promise<boolean> {
  const [from, to] = await Promise.all([callP.from, callP.to]);
  return to !== undefined && from !== undefined && !/^(0x)?0{40}$/.test(from);
}

type EthersCall = (
  tx: Deferrable<TransactionRequest>,
  blockTag?: BlockTag,
) => Promise<unknown>;

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
    const signedCall = await prepareSignedCall(params[0], signer, cipher);
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

async function prepareSignedCall(
  call: EthCall,
  signer: EthersSigner,
  cipher: Cipher,
): Promise<EthCall> {
  const dataPack = await SignedCallDataPack.make(call, signer);
  return {
    ...call,
    data: await dataPack.encryptEncode(cipher),
  };
}

const REPACK_ERROR =
  'Un-enveloped data was passed to sendRawTransaction, which is likely incorrect. Is the dapp using the Sapphire compat lib correctly?';

/** Repacks and signs a sendRawTransaction if needed and possible. */
async function repackRawTx(
  raw: string,
  cipher: Cipher,
  signer?: EthersSigner,
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { r, s, v, hash, type, ...parsed } = parseTx(raw);
  if (!signer) throw new CallError(REPACK_ERROR, null);
  if (!parsed.gasLimit) parsed.gasLimit = BigNumber.from(DEFAULT_GAS); // TODO(39)
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

/**
 * Picks the most user-trusted runtime calldata public key source based on what
 * connections are available.
 * Note: MetaMask does not support Web3 methods it doesn't know about, so we have to
 * fall back to manually querying the default gateway.
 */
export async function fetchRuntimePublicKey(
  upstream: UpstreamProvider,
): Promise<Uint8Array> {
  const isSigner = isEthersSigner(upstream);
  const provider = isSigner ? upstream['provider'] : upstream;
  if (provider && 'send' in provider) {
    // first opportunistically try `send` from the provider
    try {
      const source = provider as {
        send: (method: string, params: any[] | ((err:any,ok?:any) => void)) => Promise<any>;
      };
      const arg = 'engine' in provider ? (err:any,ok?:any)=>{} : [];
      const { key } = await source.send(OASIS_CALL_DATA_PUBLIC_KEY, arg);
      if (key) return arrayify(key);
    } catch {
      // don't do anything, move on to try chainId
    }
  }
  let chainId: number;
  if (isSigner || isEthersProvider(upstream)) {
    chainId = isSigner
      ? await upstream.getChainId()
      : (await upstream.getNetwork()).chainId;
    return fetchRuntimePublicKeyByChainId(chainId);
  }

  chainId = (await makeWeb3Provider(upstream).getNetwork()).chainId;
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
