import {
  Signer as EthersSigner,
  TypedDataSigner,
} from '@ethersproject/abstract-signer';
import { arrayify, isBytesLike } from '@ethersproject/bytes';
import * as rlp from '@ethersproject/rlp';
import {
  BlockTag,
  JsonRpcProvider,
  JsonRpcSigner,
  Provider as EthersProvider,
  TransactionRequest,
  Web3Provider,
} from '@ethersproject/providers';
import { parse as parseTx } from '@ethersproject/transactions';
import * as cbor from 'cborg';

import {
  Cipher,
  Kind as CipherKind,
  X25519DeoxysII,
  fetchRuntimePublicKey,
  lazy as lazyCipher,
} from './cipher.js';
import { CallError } from './index.js';
import { EthCall, SignedCallDataPack } from './signed_calls.js';

type EthersTypedDataSigner = EthersSigner & TypedDataSigner;

export type UpstreamProvider =
  | { request: EIP1193Request } // EIP-1193
  | { sendAsync: AsyncSend } // old MetaMask
  | { send: AsyncSend } // Web3.js
  | EthersTypedDataSigner
  | EthersProvider;

type EIP1193Request = (args: Web3ReqArgs) => Promise<unknown>;

type AsyncSend = (
  args: Web3ReqArgs,
  cb: (err: unknown, ok?: unknown) => void,
) => void;

interface Web3ReqArgs {
  readonly id?: string | number;
  readonly method: string;
  readonly params?: any[];
}

const WRAPPED_MARKER = '_isSapphireWrapped';

export function wrap<U extends UpstreamProvider>(
  upstream: U,
  customCipher?: Cipher,
): U {
  // Already wrapped, so don't wrap it again.
  if (Reflect.get(upstream, WRAPPED_MARKER) === true) return upstream;

  const cipher =
    customCipher ??
    lazyCipher(async () => {
      const rtPubKey = await fetchRuntimePublicKey(
        await inferRuntimePublicKeySource(upstream),
      );
      return X25519DeoxysII.ephemeral(rtPubKey);
    });

  if (isEthersTypedDataSigner(upstream)) {
    const signer: EthersTypedDataSigner =
      upstream.provider &&
      !((upstream instanceof JsonRpcSigner) /* cannot be reconnected */)
        ? (upstream.connect(
            wrapEthersProvider(upstream.provider, cipher, upstream),
          ) as EthersTypedDataSigner)
        : upstream;
    const hooks = {
      sendTransaction: hookEthersSend(
        signer.sendTransaction.bind(signer),
        cipher,
      ),
      signTransaction: hookEthersSend(
        signer.signTransaction.bind(signer),
        cipher,
      ),
      call: hookEthersCall(signer.call.bind(signer), cipher, signer),
      estimateGas: hookEthersCall(
        signer.estimateGas.bind(signer),
        cipher,
        signer,
      ),
      connect(provider: EthersProvider) {
        return wrap(signer.connect(provider) as EthersTypedDataSigner, cipher);
      },
    };
    return new Proxy(signer, {
      get(signer: EthersTypedDataSigner, prop) {
        if (prop === WRAPPED_MARKER) return true;
        return Reflect.get(hooks, prop) ?? proxy(signer, prop);
      },
    }) as U;
  }

  if (isEthersProvider(upstream)) {
    return wrapEthersProvider(upstream, cipher);
  }

  if ('request' in upstream) {
    const signer = new Web3Provider(upstream).getSigner();
    const hook = hookExternalProvider(signer, cipher);
    return new Proxy(upstream, {
      get(web3, prop) {
        if (prop === WRAPPED_MARKER) return true;
        if (prop === 'request') return hook;
        return proxy(web3, prop);
      },
    });
  }

  if ('send' in upstream || 'sendAsync' in upstream) {
    const signer = new Web3Provider(upstream).getSigner();
    const hookP = hookExternalProvider(signer, cipher);
    const hook = (
      args: Web3ReqArgs,
      cb: (err: unknown, ok?: unknown) => void,
    ) => {
      hookP(args)
        .then((res) => cb(null, { jsonrpc: '2.0', id: args.id, result: res }))
        .catch((err) => cb(err));
    };
    return new Proxy(upstream, {
      get(web3, prop) {
        if (prop === WRAPPED_MARKER) return true;
        // Web3.js legacy code may use both send and sendAync.
        if (prop === 'send' || prop === 'sendAsync') return hook;
        return proxy(web3, prop);
      },
    }) as U;
  }

  throw new TypeError('Unable to wrap unsupported upstream signer.');
}

function wrapEthersProvider<P extends EthersProvider>(
  provider: P,
  cipher: Cipher,
  signer?: EthersSigner,
): P {
  // Already wrapped, so don't wrap it again.
  if (Reflect.get(provider, WRAPPED_MARKER) === true) return provider;
  // If a signer is provided it's because this method was invoked by wrapping a signer,
  // so the `call` and `estimateGas` methods are already hooked.
  const hooks = signer
    ? {
        sendTransaction: <EthersProvider['sendTransaction']>(async (raw) => {
          const repacked = await repackRawTx(await raw, cipher, signer);
          return provider.sendTransaction(repacked);
        }),
      }
    : {
        // Calls can be unsigned, but must be enveloped.
        call: hookEthersCall(provider.call.bind(provider), cipher, signer),
        estimateGas: hookEthersCall(
          provider.estimateGas.bind(provider),
          cipher,
          signer,
        ),
      };
  return new Proxy(provider, {
    get(provider, prop) {
      if (prop === WRAPPED_MARKER) return true;
      return Reflect.get(hooks, prop) ?? proxy(provider, prop);
    },
  }) as P;
}

function isEthersProvider(upstream: unknown): upstream is EthersProvider {
  return EthersProvider.isProvider(upstream);
}

function isEthersTypedDataSigner(
  upstream: unknown,
): upstream is EthersTypedDataSigner {
  return EthersSigner.isSigner(upstream) && '_signTypedData' in upstream;
}

function isJsonRpcProvider(p: unknown): p is JsonRpcProvider {
  return isEthersProvider(p) && 'send' in p;
}

function hookEthersCall(
  call: EthersCall,
  cipher: Cipher,
  signer?: EthersTypedDataSigner,
): EthersCall {
  return async (callP, blockTag?: BlockTag) => {
    if (!signer || !(await callNeedsSigning(callP))) {
      const res = await call({
        ...callP,
        data: cipher.encryptEncode(await callP.data),
      });
      if (typeof res === 'string') return cipher.decryptEncoded(res);
      return res;
    }
    const dataPack = await SignedCallDataPack.make(
      (await undefer(callP)) as any /* callNeedsSigning ensures type */,
      signer,
    );
    const res = await call(
      {
        ...callP,
        data: dataPack.encryptEncode(cipher),
      },
      blockTag,
    );
    if (typeof res === 'string') return cipher.decryptEncoded(res);
    return res;
  };
}

function hookEthersSend(send: EthersCall, cipher: Cipher): EthersCall {
  return async (tx: Deferrable<TransactionRequest>, ...rest) => {
    const data = await tx.data;
    tx.data = cipher.encryptEncode(data);
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

function proxy(target: object, prop: string | symbol): any {
  const value = Reflect.get(target, prop);
  return typeof value === 'function' ? value.bind(target) : value;
}

function hookExternalProvider(
  signer: JsonRpcSigner,
  cipher: Cipher,
): EIP1193Request {
  return async (args: Web3ReqArgs) => {
    const { method, params } = await prepareRequest(args, signer, cipher);
    const res = await signer.provider.send(method, params ?? []);
    if (method === 'eth_call') return cipher.decryptEncoded(res);
    return res;
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

  if (method === 'eth_signTransaction' || method === 'eth_sendTransaction') {
    params[0].data = await cipher.encryptEncode(params[0].data);
    return { method, params };
  }

  return { method, params };
}

async function prepareSignedCall(
  call: EthCall,
  signer: EthersTypedDataSigner,
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
 *
 * If the upstream provider is Web3-like, then use that, as the user has chosen then gateway.
 * Otherwise, fetch the key from the default Web3 gateway for the particular chain ID.
 */
async function inferRuntimePublicKeySource(
  upstream: UpstreamProvider,
): Promise<Parameters<typeof fetchRuntimePublicKey>[0]> {
  const isEthersSigner = isEthersTypedDataSigner(upstream);
  if (isEthersSigner || isEthersProvider(upstream)) {
    const provider = isEthersSigner ? upstream.provider : upstream;
    if (isJsonRpcProvider(provider)) {
      return {
        send: (method, params) => provider.send(method, params),
      };
    }
    return {
      chainId: isEthersSigner
        ? await upstream.getChainId()
        : (await upstream.getNetwork()).chainId,
    };
  }
  const provider = new Web3Provider(upstream);
  return { send: (method, params) => provider.send(method, params) };
}
