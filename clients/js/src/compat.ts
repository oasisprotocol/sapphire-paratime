import * as cbor from 'cborg';
import {
  AbstractProvider,
  AbstractSigner,
  BrowserProvider,
  ContractRunner,
  JsonRpcProvider,
  JsonRpcSigner,
  Provider,
  Signer,
  Transaction,
  TransactionRequest,
  TransactionResponse,
  decodeRlp,
  getBytes,
  isBytesLike,
  toQuantity,
} from 'ethers';

import {
  Cipher,
  Kind as CipherKind,
  X25519DeoxysII,
  fetchRuntimePublicKeyByChainId,
  lazy as lazyCipher,
} from './cipher.js';
import { CallError, OASIS_CALL_DATA_PUBLIC_KEY } from './index.js';
import { SignedCallDataPack } from './signed_calls.js';

type Ethers5Signer = {
  connect(provider: any): Ethers5Signer;
  sendTransaction(transaction: Deferrable<any>): Promise<any>;
  signTransaction(transaction: Deferrable<any>): Promise<string>;
  call(transaction: Deferrable<any>, blockTag?: any): Promise<string>;
  estimateGas(transaction: Deferrable<any>): Promise<any>;
  _isSigner: boolean;
  provider?: any;
};

export type UpstreamProvider =
  | EIP1193Provider
  | Ethers5Signer
  | Signer
  | Provider;

export type EIP1193Provider = {
  request: (args: Web3ReqArgs) => Promise<unknown>;
};

export type SendProvider = {
  send?: Send;
};

export type Send = (method: string, params: any[]) => Promise<unknown>;

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
export function wrap<P extends SendProvider>( // Legacy
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
): (U | (EIP1193Provider & SendProvider)) & SapphireAnnex {
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
    const send: JsonRpcProvider['send'] = ((method, params) => {
      const simpleParams = params as any[];
      return request({ method, params: simpleParams });
    }) as JsonRpcProvider['send'];
    return makeProxy(provider, cipher, {
      send,
      request,
    }) as unknown as EIP1193Provider & SendProvider & SapphireAnnex;
  }

  const cipher = customCipher ?? getCipher(upstream);

  if (isEthers5Signer(upstream) || isEthers6Signer(upstream)) {
    let signer: Signer | Ethers5Signer;
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
      estimateGas: hookEthersCall(signer, 'estimateGas', cipher),
      connect(provider: Provider) {
        return wrap(signer.connect(provider) as unknown as Signer, cipher);
      },
    } as Partial<Signer>;
    return makeProxy(signer as any, cipher, hooks);
  }

  if (isEthersProvider(upstream)) {
    return wrapEthersProvider(upstream, cipher);
  }

  if ('isMetaMask' in upstream && upstream.isMetaMask) {
    const browserProvider = new BrowserProvider(upstream);
    const request = hookExternalSigner(browserProvider, cipher);
    const sendAsync = callbackify(request);

    return makeProxy(upstream, cipher, {
      request,
      sendAsync,
    });
  }

  if ('request' in upstream) {
    //  || 'send' in upstream
    const browserProvider = new BrowserProvider(upstream);
    const request = hookExternalSigner(browserProvider, cipher);
    const send: JsonRpcProvider['send'] = ((method, params) => {
      return request({ method, params: params as any[] });
    }) as JsonRpcProvider['send'];

    return makeProxy(upstream, cipher, {
      request,
      send,
    });
  }

  throw new TypeError('Unable to wrap unsupported upstream signer.');
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

function wrapEthersProvider<P extends Provider>(
  provider: P,
  cipher: Cipher,
  signer?: Ethers5Signer | Signer,
): P & SapphireAnnex {
  // Already wrapped, so don't wrap it again.
  if (Reflect.get(provider, SAPPHIRE_PROP) !== undefined) {
    return provider as P & SapphireAnnex;
  }

  const hooks = signer
    ? {}
    : {
        // Calls can be unsigned, but must be enveloped.
        call: hookEthersCall(provider, 'call', cipher),
        estimateGas: hookEthersCall(provider, 'estimateGas', cipher),
      };
  return makeProxy(provider, cipher, hooks);
}

function isEthers5Signer(upstream: object): upstream is Ethers5Signer {
  return Reflect.get(upstream, '_isSigner') === true;
}

function isEthers6Signer(upstream: object): upstream is Signer {
  return upstream instanceof AbstractSigner;
}

function isEthersSigner(upstream: object): upstream is Signer {
  return isEthers5Signer(upstream) || isEthers6Signer(upstream);
}

function isEthersProvider(upstream: object): upstream is Provider {
  const isEthersv5 = Reflect.get(upstream, '_isProvider') === true;
  const isEthersv6 = upstream instanceof AbstractProvider;
  return isEthersv5 || isEthersv6;
}

function hookEthersCall(
  runner: Ethers5Signer | ContractRunner,
  method: 'call' | 'estimateGas',
  cipher: Cipher,
): EthersCall | undefined {
  const sendUnsignedCall = async (
    runner: ContractRunner | Ethers5Signer,
    call: TransactionRequest,
  ) => {
    return runner[method]!({
      ...call,
      data: await cipher.encryptEncode(call.data ?? new Uint8Array()),
    });
  };
  return async (call) => {
    let res: string | bigint | TransactionResponse;
    if (isEthersSigner(runner)) {
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

function hookEthersSend(send: EthersCall, cipher: Cipher): EthersCall {
  return async (tx: TransactionRequest, ...rest) => {
    if (tx.data) tx.data = await cipher.encryptEncode(tx.data);
    return send(tx, ...rest);
  };
}

async function callNeedsSigning(
  callP: Deferrable<TransactionRequest> | TransactionRequest,
): Promise<boolean> {
  const [from, to] = await Promise.all([callP.from, callP.to]);
  return (
    !!to && !!from && typeof from === 'string' && !/^(0x)?0{40}$/.test(from)
  );
}

type EthersCall = (tx: TransactionRequest) => Promise<unknown>;

type Deferrable<T> = {
  [K in keyof T]: T[K] | Promise<T[K]>;
};

async function undefer<T>(obj: Deferrable<T>): Promise<T> {
  return Object.fromEntries(
    await Promise.all(Object.entries(obj).map(async ([k, v]) => [k, await v])),
  );
}

function hookExternalSigner(
  provider: BrowserProvider,
  cipher: Cipher,
): EIP1193Provider['request'] {
  return async (args: Web3ReqArgs) => {
    const signer = await provider.getSigner();
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
    if (method === 'eth_call' && params) {
      params[0].data = await cipher.encryptEncode(params[0].data);
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
): Promise<{ method: string; params?: Array<any> }> {
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

  if (
    /^eth_((send|sign)Transaction|call|estimateGas)$/.test(method) &&
    params[0].data // Ignore balance transfers without calldata
  ) {
    params[0].data = await cipher.encryptEncode(params[0].data);
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
  signer?: Signer,
): Promise<string> {
  const DATA_FIELD = 5;
  const txFields = decodeRlp(raw);
  const data = getBytes(txFields[DATA_FIELD] as string);
  try {
    const { format, body, ...extra } = cbor.decode(data);
    if (envelopeFormatOk(format, body, extra)) return raw;
    throw new EnvelopeError(
      'Bogus enveloped data found in sendRawTransaction.',
    );
  } catch (e) {
    if (e instanceof EnvelopeError) throw e;
  }
  const tx = Transaction.from(raw);
  if (tx.isSigned() && (!signer || (await signer!.getAddress()) != tx.from!)) {
    // encrypted tx cannot be re-signed, allow passthrough when
    // submitting a transaction signed by another keypair
    return tx.serialized;
  }
  const q = (v: bigint | null | undefined): string | undefined => {
    if (!v) return undefined;
    return toQuantity(v);
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
  try {
    return signer!.signTransaction({
      ...parsed,
      data: await cipher.encryptEncode(data),
    });
  } catch (e) {
    // Many JSON-RPC providers, Ethers included, will not let you directly
    // sign transactions, which is necessary to re-encrypt the calldata!
    // Throw an error here to prevent calls which should've been encrypted
    // from being submitted unencrypted.
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
  if (format != null && format !== CipherKind.Plain) {
    if (isBytesLike(body)) return false;
    if (!isBytesLike(body.data)) return false;
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
  const provider = isEthersSigner(upstream) ? upstream['provider'] : upstream;
  if (provider && 'send' in provider) {
    // first opportunistically try `send` from the provider
    try {
      const source = provider as {
        send: (
          method: string | { method: string; params: any[] },
          params?: any[],
        ) => Promise<any>;
      };
      const resp = await source.send(OASIS_CALL_DATA_PUBLIC_KEY, []);
      if ('key' in resp) {
        const key = resp.key;
        return getBytes(key);
      }
    } catch (ex) {
      // don't do anything, move on to try chainId
    }
  }

  if (isEthersProvider(upstream)) {
    const chainId = Number((await upstream.getNetwork()).chainId);
    return fetchRuntimePublicKeyByChainId(chainId);
  }

  if (isEthers5Signer(upstream) || isEthers6Signer(upstream)) {
    const chainId = Number((await upstream.provider!.getNetwork()).chainId);
    return fetchRuntimePublicKeyByChainId(chainId);
  }

  const chainId = Number(
    (await new BrowserProvider(upstream).getNetwork()).chainId,
  );
  return fetchRuntimePublicKeyByChainId(chainId);
}
