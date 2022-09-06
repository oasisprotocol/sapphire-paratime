import { Signer as AbstractSigner } from '@ethersproject/abstract-signer';
import { getContractAddress } from '@ethersproject/address';
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

import {
  Cipher,
  Kind as CipherKind,
  X25519DeoxysII,
  fetchRuntimePublicKey,
  lazy as lazyCipher,
} from './cipher.js';
import { CallError } from './index.js';
import {
  EthCall,
  SignedCallDataPack,
  Signer as SignedCallSigner,
} from './signed_calls.js';

export type UpstreamProvider =
  | { request: EIP1193Request } // EIP-1193
  | { sendAsync: AsyncSend } // old MetaMask
  | { send: AsyncSend } // Web3.js
  | EthersSigner
  | EthersProvider;

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

export type EIP1193Request = (args: Web3ReqArgs) => Promise<unknown>;

export type AsyncSend = (
  args: Web3ReqArgs,
  cb: (err: unknown, ok?: unknown) => void,
) => void;

export interface Web3ReqArgs {
  readonly id?: string | number;
  readonly method: string;
  readonly params?: any[];
}

const SAPPHIRE_PROP = 'sapphire';
export type SapphireAnnex = {
  [SAPPHIRE_PROP]: {
    cipher: Cipher;
  };
};

/** If a gas limit is not provided, the runtime will produce a very confusing error message, so we set a default limit. This one is very high, but solves the problem. This should be lowered once error messages are better or gas estimation is enabled. */
const DEFAULT_GAS = 3_000_000;

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
 * ```
 * @param customCipher An optional cipher to use for encrypting messages. If not provided an encrypting cipher will be chosen. This field is useful for providing a {@link cipher.Plain} cipher or using a custom public key for an encrypting cipher.
 */
export function wrap<U extends UpstreamProvider>(
  upstream: U,
  customCipher?: Cipher,
): U & SapphireAnnex {
  // Already wrapped, so don't wrap it again.
  if (Reflect.get(upstream, SAPPHIRE_PROP) !== undefined) {
    return upstream as U & SapphireAnnex;
  }

  const cipher =
    customCipher ??
    lazyCipher(async () => {
      const rtPubKey = await fetchRuntimePublicKey(
        await inferRuntimePublicKeySource(upstream),
      );
      return X25519DeoxysII.ephemeral(rtPubKey);
    });

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
      call: hookEthersCall(signer.call.bind(signer), cipher, signer),
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

  if ('request' in upstream) {
    const signer = new Web3Provider(upstream).getSigner();
    const hook = hookExternalProvider(signer, cipher);
    return makeProxy(upstream, cipher, { request: hook });
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
    return makeProxy(upstream, cipher, {
      send: hook,
      sendAsync: hook,
    });
  }

  throw new TypeError('Unable to wrap unsupported upstream signer.');
}

function makeProxy<U extends UpstreamProvider>(
  upstream: U,
  cipher: Cipher,
  hooks: { [key: string | symbol]: any },
): U & SapphireAnnex {
  return new Proxy(upstream, {
    get(upstream, prop) {
      if (prop === SAPPHIRE_PROP) return { cipher };
      if (prop in hooks) return hooks[prop];
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
        call: hookEthersCall(provider.call.bind(provider), cipher, signer),
        estimateGas: hookEthersCall(
          provider.estimateGas.bind(provider),
          cipher,
          signer,
        ),
      };
  return makeProxy(provider, cipher, hooks);
}

function isEthersProvider(upstream: unknown): upstream is EthersProvider {
  return AbstractProvider.isProvider(upstream);
}

function isEthersSigner(upstream: unknown): upstream is EthersSigner {
  return AbstractSigner.isSigner(upstream) && '_signTypedData' in upstream;
}

function isJsonRpcProvider(p: unknown): p is JsonRpcProvider {
  return isEthersProvider(p) && 'send' in p;
}

function hookEthersCall(
  call: EthersCall,
  cipher: Cipher,
  signer?: EthersSigner,
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

function hookExternalProvider(
  signer: JsonRpcSigner,
  cipher: Cipher,
): EIP1193Request {
  return async (args: Web3ReqArgs) => {
    if (args.method === 'eth_estimateGas')
      return BigNumber.from(DEFAULT_GAS).toHexString(); // TODO(#39)
    const { method, params } = await prepareRequest(args, signer, cipher);
    const res = await signer.provider.send(method, params ?? []);
    if (method === 'eth_call') return cipher.decryptEncoded(res);
    if (method === 'eth_getTransactionReceipt' && res?.contractAddress) {
      // TODO(#41)
      const prevBlock = Number.parseInt(res.blockNumber, 16) - 1;
      const nonce = await signer.getTransactionCount(prevBlock);
      res.contractAddress = getContractAddress({ from: res.from, nonce });
    }
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

  if (/^eth_((send|sign)Transaction|call|estimateGas)$/.test(method)) {
    params[0].data = await cipher.encryptEncode(params[0].data);
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
 *
 * If the upstream provider is Web3-like, then use that, as the user has chosen then gateway.
 * Otherwise, fetch the key from the default Web3 gateway for the particular chain ID.
 *
 * Note: MetaMask does not support Web3 methods it doesn't know about, so we have to
 * fall back to manually querying the default gateway.
 */
async function inferRuntimePublicKeySource(
  upstream: UpstreamProvider,
): Promise<Parameters<typeof fetchRuntimePublicKey>[0]> {
  const isSigner = isEthersSigner(upstream);
  if (isSigner || isEthersProvider(upstream)) {
    const provider = isSigner ? upstream.provider : upstream;
    if (isJsonRpcProvider(provider) && !(upstream as any).isMetaMask) {
      return {
        send: (method, params) => provider.send(method, params),
      };
    }
    return {
      chainId: isSigner
        ? await upstream.getChainId()
        : (await upstream.getNetwork()).chainId,
    };
  }
  const provider = new Web3Provider(upstream);
  return {
    chainId: (await provider.getNetwork()).chainId,
  };
}
