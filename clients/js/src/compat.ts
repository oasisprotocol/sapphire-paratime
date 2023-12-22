import * as cbor from 'cborg';
import {
  Provider,
  AbstractSigner,
  BrowserProvider,
  ContractRunner,
  JsonRpcProvider,
  JsonRpcSigner,
  Signer,
  Transaction,
  TransactionRequest,
  TransactionResponse,
  decodeRlp,
  getBytes,
  isBytesLike,
  toQuantity,
  AbstractProvider,
} from 'ethers';

import {
  Cipher,
  Kind as CipherKind,
  X25519DeoxysII,
  lazy as lazyCipher,
} from './cipher.js';
import { CallError, OASIS_CALL_DATA_PUBLIC_KEY } from './index.js';
import { EthCall, SignedCallDataPack } from './signed_calls.js';
import { NETWORKS } from './networks.js';

import {
  Deferrable,
  Ethers5Signer,
  Ethers5Provider,
  EIP1193Provider,
  Web3ReqArgs
} from './interfaces.js';

export type UpstreamProvider =
  | EIP1193Provider
  | Ethers5Signer
  | Ethers5Provider;

export type Send = (method: string, params: any[]) => Promise<unknown>;

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
 */
export function wrap<U extends EIP1193Provider>( // `window.ethereum`
  upstream: U
): U & SapphireAnnex;
export function wrap<U extends Ethers5Provider>( // Ethers providers
  upstream: U
): U & SapphireAnnex;
export function wrap<U extends Ethers5Signer>( // Ethers signers
  upstream: U
): U & SapphireAnnex;
export function wrap<U extends UpstreamProvider>(
  upstream: U
): U & SapphireAnnex
{
  // Already wrapped, so don't wrap it again.
  if (
    typeof upstream !== 'string' &&
    Reflect.get(upstream, SAPPHIRE_PROP) !== undefined
  ) {
    return upstream as U & SapphireAnnex;
  }

  if (typeof upstream === 'string') {
    return wrapEthersProvider(new JsonRpcProvider(upstream)) as any;
  }

  const cipher = getCipher(upstream);

  if (isEthers5Signer(upstream) || isEthers6Signer(upstream)) {
    return wrapEthersSigner(upstream as Ethers5Signer, cipher) as any;
  }

  if (isEthersProvider(upstream)) {
    return wrapEthersProvider(upstream, cipher);
  }

  // The only other thing we wrap is EIP-1193 compatible providers
  if ('request' in upstream)
  {
    const browserProvider = new BrowserProvider(upstream);
    const request = hookEIP1193Request(browserProvider, cipher);
    return makeProxy(upstream, cipher, {
      request: request,
      send: async function (...args: any[]) {
        return await request({method: args[0], params: args[1]});
      },
      sendAsync: function (...args: any[]) {
        throw new Error('sendAsync()Fail ' + args);
      }
    });
  }

  throw new TypeError('Unable to wrap unsupported provider.');
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

export function wrapEthersSigner<P extends Ethers5Signer>(
  upstream: P,
  cipher?: Cipher
): P & SapphireAnnex
{
  if( ! cipher ) {
    cipher = getCipher(upstream);
  }

  let signer: Ethers5Signer;
  if (upstream.provider) {
    try {
      const x = wrapEthersProvider(upstream.provider, cipher, upstream);
      signer = upstream.connect(x as any);
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
    connect(provider: Ethers5Provider) {
      const wp = signer.connect(provider);
      return wrapEthersSigner(wp, cipher);
    },
  };
  return makeProxy(signer as any, cipher, hooks);
}

interface Ethers5ProviderWithSend {
  sendTransaction(signedTransaction: string | Promise<string>): Promise<TransactionResponse>;
}

export function wrapEthersProvider<P extends Provider | Ethers5Provider>(
  provider: P,
  cipher?: Cipher,
  signer?: Ethers5Signer | Signer,
): P & SapphireAnnex {
  if( ! cipher ) {
    cipher = getCipher(provider);
  }
  // Already wrapped, so don't wrap it again.
  if (Reflect.get(provider, SAPPHIRE_PROP) !== undefined) {
    return provider as P & SapphireAnnex;
  }

  const hooks: Record<string, any> = {
    // Calls can be unsigned, but must be enveloped.
    call: hookEthersCall(provider, 'call', cipher),
    estimateGas: hookEthersCall(provider, 'estimateGas', cipher),
  };

  // When a signer is also provided, we can re-pack transactions
  // But only if they've been signed by the same address as the signer
  if( signer ) {
    // Ethers v6 `sendTransaction` takes `TransactionRequest`
    //  v6 equivalent to `sendTransaction` is `broadcastTransaction`
    if( 'broadcastTransaction' in provider ) {
      hooks['broadcastTransaction'] = <Provider["broadcastTransaction"]>(async (raw: string) => {
        if( ! cipher ) {
          throw new Error('Unable to get cipher!');
        }
        const repacked = await repackRawTx(raw, cipher, signer);
        return (provider as Provider).broadcastTransaction(repacked);
      });
    }
    else {
      // Ethers v5 doesn't have `broadcastTransaction`
      // Ethers v5 `sendTransaction` takes hex encoded byte string
      hooks['sendTransaction'] = <Ethers5ProviderWithSend["sendTransaction"]>(async (raw: string) => {
        if( ! cipher ) {
          throw new Error('Unable to get cipher!');
        }
        const repacked = await repackRawTx(raw, cipher, signer);
        return (provider as unknown as Ethers5ProviderWithSend).sendTransaction(repacked);
      });
    }
  }

  return makeProxy(provider, cipher, hooks);
}

function isEthers5Signer(upstream: object): upstream is Ethers5Signer {
  return Reflect.get(upstream, '_isSigner') === true;
}

function isEthers6Signer(upstream: object): upstream is Signer {
  return upstream instanceof AbstractSigner;
}

function isEthersSigner(upstream: object): upstream is Signer | Ethers5Signer {
  return isEthers5Signer(upstream) || isEthers6Signer(upstream);
}

function isEthers5Provider(upstream: object): upstream is Ethers5Signer {
  return Reflect.get(upstream, '_isProvider') === true;
}

function isEthers6Provider(upstream: object): upstream is Provider {
  return upstream instanceof AbstractProvider;
}

function isEthersProvider(upstream: object): upstream is Provider | Ethers5Provider {
  return isEthers5Provider(upstream) || isEthers6Provider(upstream);
}

function hookEthersCall(
  runner: Ethers5Provider | Ethers5Signer | ContractRunner,
  method: 'call' | 'estimateGas',
  cipher: Cipher,
): EthersCall | undefined {
  const sendUnsignedCall = async (
    runner: Ethers5Provider | Ethers5Signer | ContractRunner,
    call: EthCall | TransactionRequest,
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
          call,
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

type EthersCall = (tx: EthCall | TransactionRequest) => Promise<unknown>;

function hookEthersSend<C>(send: C, cipher: Cipher): C {
  return (async (tx: EthCall | TransactionRequest, ...rest : any[]) => {
    if (tx.data) tx.data = await cipher.encryptEncode(tx.data);
    return (send as any)(tx, ...rest);
  }) as C;
}

function hookEIP1193Request(
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


// -----------------------------------------------------------------------------


async function callNeedsSigning(
  callP: Deferrable<EthCall> | TransactionRequest,
): Promise<boolean> {
  const [from, to] = await Promise.all([callP.from, callP.to]);
  return (
    !!to && !!from && typeof from === 'string' && !/^(0x)?0{40}$/.test(from)
  );
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
  signer?: Ethers5Signer | Signer,
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


// -----------------------------------------------------------------------------
// Fetch calldata public key
// Well use provider when possible, and fallback to HTTP(S)? requests
// e.g. MetaMask doesn't allow the oasis_callDataPublicKey JSON-RPC method


type CallDataPublicKeyResponse = {
  result: { key: string; checksum: string; signature: string };
};

async function fetchRuntimePublicKeyNode(
  gwUrl: string,
): Promise<CallDataPublicKeyResponse> {
  // Import http or https, depending on the URI scheme.
  const https = await import(/* webpackIgnore: true */ gwUrl.split(':')[0]);

  const body = makeCallDataPublicKeyBody();
  return new Promise((resolve, reject) => {
    const opts = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': body.length,
      },
    };
    const req = https.request(gwUrl, opts, (res: any) => {
      const chunks: Buffer[] = [];
      res.on('error', (err:any) => reject(err));
      res.on('data', (chunk:any) => chunks.push(chunk));
      res.on('end', () => {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      });
    });
    req.on('error', (err: Error) => reject(err));
    req.write(body);
    req.end();
  });
}

async function fetchRuntimePublicKeyBrowser(
  gwUrl: string,
  fetchImpl: typeof fetch,
): Promise<CallDataPublicKeyResponse> {
  const res = await fetchImpl(gwUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: makeCallDataPublicKeyBody(),
  });
  if (!res.ok) {
    throw new CallError('Failed to fetch runtime public key.', res);
  }
  return await res.json();
}

function makeCallDataPublicKeyBody(): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: Math.floor(Math.random() * 1e9),
    method: OASIS_CALL_DATA_PUBLIC_KEY,
    params: [],
  });
}

export async function fetchRuntimePublicKeyByChainId(
  chainId: number,
  opts?: { fetch?: typeof fetch },
): Promise<Uint8Array> {
  const { defaultGateway: gatewayUrl } = NETWORKS[chainId];
  if (!gatewayUrl)
    throw new Error(
      `Unable to fetch runtime public key for network with unknown ID: ${chainId}.`,
    );
  const fetchImpl = globalThis?.fetch ?? opts?.fetch;
  const res = await (fetchImpl
    ? fetchRuntimePublicKeyBrowser(gatewayUrl, fetchImpl)
    : fetchRuntimePublicKeyNode(gatewayUrl));
  return getBytes(res.result.key);
}

/**
 * Picks the most user-trusted runtime calldata public key source based on what
 * connections are available.
 */
export async function fetchRuntimePublicKey(
  upstream: UpstreamProvider,
): Promise<Uint8Array> {
  const provider = 'provider' in upstream ? upstream['provider'] : upstream;
  if ( provider ) {
    let resp : any;
    // It's probably an EIP-1193 provider
    if( 'request' in provider ) {
      try {
        const source = provider as EIP1193Provider;
        resp = await source.request({method: OASIS_CALL_DATA_PUBLIC_KEY, params: []});
      } catch (ex) {
        // don't do anything, move on to try next
      }
    }
    // If it's a `send` provider
    else if( 'send' in provider ) {
      try {
        const source = provider as {
          send: (
            method: string,
            params: any[],
          ) => Promise<any>;
        };
        resp = await source.send(OASIS_CALL_DATA_PUBLIC_KEY, []);
      } catch (ex) {
        // don't do anything, move on to try chainId fetch
      }
    }
    if ('key' in resp) {
      const key = resp.key;
      return getBytes(key);
    }
  }

  // Note: MetaMask does not support Web3 methods it doesn't know about, so we have to
  // fall back to manually querying the default gateway.
  const chainId = Number(
    (await new BrowserProvider(provider).getNetwork()).chainId,
  );
  return fetchRuntimePublicKeyByChainId(chainId);
}
