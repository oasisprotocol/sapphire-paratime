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
  getBytes,
  isBytesLike,
  AbstractProvider,
  BytesLike,
  hexlify,
} from 'ethers';

import {
  Cipher,
  Kind as CipherKind,
  Envelope,
  X25519DeoxysII,
  lazy as lazyCipher,
} from './cipher.js';
import { CallError, OASIS_CALL_DATA_PUBLIC_KEY } from './index.js';
import { EthCall, Leash, SignedCallDataPack } from './signed_calls.js';
import { NETWORKS } from './networks.js';

import {
  Deferrable,
  Ethers5Signer,
  Ethers5Provider,
  EIP1193Provider,
  Web3ReqArgs,
} from './interfaces.js';

export type UpstreamProvider =
  | EIP1193Provider
  | Ethers5Signer
  | Ethers5Provider;

interface SapphireWrapOptions {
  cipher: Cipher;
}

const SAPPHIRE_PROP = 'sapphire';
export type SapphireAnnex = {
  [SAPPHIRE_PROP]: SapphireWrapOptions;
};

function fillOptions(
  options: SapphireWrapOptions | undefined,
  provider: UpstreamProvider,
): SapphireWrapOptions {
  if (!options) {
    options = {} as SapphireWrapOptions;
  }
  if (!options.cipher) {
    options.cipher = getCipher(provider);
  }
  return options;
}

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
export function wrap<U extends EIP1193Provider>(
  upstream: U,
  options?: SapphireWrapOptions,
): U & SapphireAnnex; // `window.ethereum`

export function wrap<U extends Ethers5Provider>(
  upstream: U,
  options?: SapphireWrapOptions,
): U & SapphireAnnex; // Ethers providers

export function wrap<U extends Ethers5Signer>(
  upstream: U,
  options?: SapphireWrapOptions,
): U & SapphireAnnex; // Ethers signers

export function wrap<U extends UpstreamProvider>(
  upstream: U,
  options?: SapphireWrapOptions,
): U & SapphireAnnex {
  // Already wrapped, so don't wrap it again.
  if (
    typeof upstream !== 'string' &&
    Reflect.get(upstream, SAPPHIRE_PROP) !== undefined
  ) {
    return upstream as U & SapphireAnnex;
  }

  if (typeof upstream === 'string') {
    upstream = new JsonRpcProvider(upstream) as any;
  }

  const filled_options = fillOptions(options, upstream);

  if (isEthersSigner(upstream)) {
    return wrapEthersSigner(upstream as Ethers5Signer, filled_options) as any;
  }

  if (isEthersProvider(upstream)) {
    return wrapEthersProvider(upstream, filled_options);
  }

  // The only other thing we wrap is EIP-1193 compatible providers
  if (isEIP1193Provider(upstream)) {
    return wrapEIP1193Provider(upstream, filled_options);
  }

  throw new TypeError('Unable to wrap unsupported provider.');
}

// -----------------------------------------------------------------------------
// Wrap an EIP-1193 compatible provider
// Under the hood, we wrap it in an ethers BrowserProvider to be used internally

function isEIP1193Provider(upstream: object): upstream is EIP1193Provider {
  return 'request' in upstream;
}

function wrapEIP1193Provider<P extends EIP1193Provider>(
  upstream: P,
  options?: SapphireWrapOptions,
): P & SapphireAnnex {
  const filled_options = fillOptions(options, upstream);
  const browserProvider = new BrowserProvider(upstream);
  const request = hookEIP1193Request(browserProvider, filled_options);
  const hooks: Record<string, any> = {
    request: request,
  };
  if ('send' in upstream) {
    // Send is deprecated, but still used by ethers
    hooks['send'] = async (...args: any[]) => {
      return await request({ method: args[0], params: args[1] });
    };
  }
  if ('sendAsync' in upstream) {
    // sendAsync is deprecated, it historically has an incoherent interface
    hooks['sendAsync'] = () => {
      throw new Error('sendAsync not supported by Sapphire wrapper!');
    };
  }
  return makeProxy(upstream, filled_options, hooks);
}

function hookEIP1193Request(
  provider: BrowserProvider,
  options: SapphireWrapOptions,
): EIP1193Provider['request'] {
  return async (args: Web3ReqArgs) => {
    const signer = await provider.getSigner();
    const { method, params } = await prepareRequest(args, signer, options);
    const res = await signer.provider.send(method, params ?? []);
    if (method === 'eth_call') return options.cipher.decryptEncoded(res);
    return res;
  };
}

// -----------------------------------------------------------------------------

function getCipher(provider: UpstreamProvider): Cipher {
  return lazyCipher(async () => {
    const rtPubKey = await fetchRuntimePublicKey(provider);
    return X25519DeoxysII.ephemeral(rtPubKey);
  });
}

function makeProxy<U extends UpstreamProvider>(
  upstream: U,
  options: SapphireWrapOptions,
  hooks: Record<string, any>,
): U & SapphireAnnex {
  return new Proxy(upstream, {
    get(upstream, prop) {
      if (prop === SAPPHIRE_PROP) return options;
      if (prop in hooks) return Reflect.get(hooks, prop);
      const value = Reflect.get(upstream, prop);
      return typeof value === 'function' ? value.bind(upstream) : value;
    },
  }) as U & SapphireAnnex;
}

// -----------------------------------------------------------------------------

export function wrapEthersSigner<P extends Ethers5Signer>(
  upstream: P,
  options?: SapphireWrapOptions,
): P & SapphireAnnex {
  const filled_options = fillOptions(options, upstream);

  let signer: Ethers5Signer;
  if (upstream.provider) {
    try {
      const x = wrapEthersProvider(upstream.provider, filled_options, upstream);
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
      filled_options,
    ),
    signTransaction: hookEthersSend(
      signer.signTransaction.bind(signer),
      filled_options,
    ),
    call: hookEthersCall(signer, 'call', filled_options),
    estimateGas: hookEthersCall(signer, 'estimateGas', filled_options),
    connect(provider: Ethers5Provider) {
      const wp = signer.connect(provider);
      return wrapEthersSigner(wp, filled_options);
    },
  };
  return makeProxy(signer as any, filled_options, hooks);
}

interface Ethers5ProviderWithSend {
  sendTransaction(
    signedTransaction: string | Promise<string>,
  ): Promise<TransactionResponse>;
}

export function wrapEthersProvider<P extends Provider | Ethers5Provider>(
  provider: P,
  options?: SapphireWrapOptions,
  signer?: Ethers5Signer | Signer,
): P & SapphireAnnex {
  const filled_options = fillOptions(options, provider);

  // Already wrapped, so don't wrap it again.
  if (Reflect.get(provider, SAPPHIRE_PROP) !== undefined) {
    return provider as P & SapphireAnnex;
  }

  const hooks: Record<string, any> = {
    // Calls can be unsigned, but must be enveloped.
    call: hookEthersCall(provider, 'call', filled_options),
    estimateGas: hookEthersCall(provider, 'estimateGas', filled_options),
  };

  // When a signer is also provided, we can re-pack transactions
  // But only if they've been signed by the same address as the signer
  if (signer) {
    // Ethers v6 `sendTransaction` takes `TransactionRequest`
    //  v6 equivalent to `sendTransaction` is `broadcastTransaction`
    if ('broadcastTransaction' in provider) {
      hooks['broadcastTransaction'] = <Provider['broadcastTransaction']>(async (
        raw: string,
      ) => {
        const repacked = await repackRawTx(raw, filled_options, signer);
        return (provider as Provider).broadcastTransaction(repacked);
      });
    } else {
      // Ethers v5 doesn't have `broadcastTransaction`
      // Ethers v5 `sendTransaction` takes hex encoded byte string
      hooks['sendTransaction'] = <Ethers5ProviderWithSend['sendTransaction']>(
        (async (raw: string) => {
          const repacked = await repackRawTx(raw, filled_options, signer);
          return (
            provider as unknown as Ethers5ProviderWithSend
          ).sendTransaction(repacked);
        })
      );
    }
  }

  return makeProxy(provider, filled_options, hooks);
}

function isEthers5Signer(upstream: object): upstream is Ethers5Signer {
  return Reflect.get(upstream, '_isSigner') === true;
}

function isEthers6Signer(upstream: object): upstream is Signer {
  // XXX: this will not match if installed ethers version is different!
  return upstream instanceof AbstractSigner;
}

function isEthersSigner(upstream: object): upstream is Signer | Ethers5Signer {
  return isEthers5Signer(upstream) || isEthers6Signer(upstream);
}

function isEthers5Provider(upstream: object): upstream is Ethers5Signer {
  return Reflect.get(upstream, '_isProvider') === true;
}

function isEthers6Provider(upstream: object): upstream is Provider {
  // XXX: this will not match if installed ethers version is different!
  return upstream instanceof AbstractProvider;
}

function isEthersProvider(
  upstream: object,
): upstream is Provider | Ethers5Provider {
  return isEthers5Provider(upstream) || isEthers6Provider(upstream);
}

function hookEthersCall(
  runner: Ethers5Provider | Ethers5Signer | ContractRunner,
  method: 'call' | 'estimateGas',
  options: SapphireWrapOptions,
): EthersCall | undefined {
  const sendUnsignedCall = async (
    runner: Ethers5Provider | Ethers5Signer | ContractRunner,
    call: EthCall | TransactionRequest,
    is_already_enveloped: boolean,
  ) => {
    let call_data = call.data;
    if (!is_already_enveloped) {
      call_data = await options.cipher.encryptEncode(
        call.data ?? new Uint8Array(),
      );
    }
    return runner[method]!({
      ...call,
      data: hexlify(call_data!),
    });
  };
  return async (call) => {
    let res: string;
    const is_already_enveloped = isCalldataEnveloped(call.data!, true);
    if (!is_already_enveloped && isEthersSigner(runner)) {
      const signer = runner;
      if (!signer.provider)
        throw new Error('signer not connected to a provider');
      const provider = signer.provider;
      if (await callNeedsSigning(call)) {
        const dataPack = await SignedCallDataPack.make(call, signer);
        res = await provider[method]({
          ...call,
          data: await dataPack.encryptEncode(options.cipher),
        });
      } else {
        res = await sendUnsignedCall(provider, call, is_already_enveloped);
      }
    } else {
      res = await sendUnsignedCall(runner, call, is_already_enveloped);
    }
    // NOTE: if it's already enveloped, caller will decrypt it (not us)
    if (!is_already_enveloped && typeof res === 'string') {
      return options.cipher.decryptEncoded(res);
    }
    return res;
  };
}

type EthersCall = (tx: EthCall | TransactionRequest) => Promise<unknown>;

function hookEthersSend<C>(send: C, options: SapphireWrapOptions): C {
  return (async (tx: EthCall | TransactionRequest, ...rest: any[]) => {
    if (tx.data) tx.data = await options.cipher.encryptEncode(tx.data);
    return (send as any)(tx, ...rest);
  }) as C;
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
  options: SapphireWrapOptions,
): Promise<{ method: string; params?: Array<any> }> {
  if (!Array.isArray(params)) return { method, params };

  if (method === 'eth_sendRawTransaction') {
    return {
      method,
      params: [await repackRawTx(params[0], options, signer)],
    };
  }

  if (
    (method === 'eth_call' || method === 'eth_estimateGas') &&
    (await callNeedsSigning(params[0]))
  ) {
    const dataPack = await SignedCallDataPack.make(params[0], signer);
    const signedCall = {
      ...params[0],
      data: await dataPack.encryptEncode(options.cipher),
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
    params[0].data = await options.cipher.encryptEncode(params[0].data);
    return { method, params };
  }

  return { method, params };
}

class EnvelopeError extends Error {}

const REPACK_ERROR =
  'Un-enveloped data was passed to sendRawTransaction, which is likely incorrect. Is the dapp using the Sapphire compat lib correctly?';

/** Repacks and signs a sendRawTransaction if needed and possible. */
async function repackRawTx(
  raw: string,
  options: SapphireWrapOptions,
  signer?: Ethers5Signer | Signer,
): Promise<string> {
  const tx = Transaction.from(raw);

  // If raw transaction is enveloped & signed correctly, bypass re-packing
  if (isCalldataEnveloped(tx.data, false)) {
    return raw;
  }

  // When transaction is signed by another keypair and we don't have that signer
  // bypass re-packing, this allows repacking to pass-thru pre-signed txs
  if (tx.isSigned() && (!signer || (await signer!.getAddress()) != tx.from!)) {
    return raw;
  }

  tx.data = await options.cipher.encryptEncode(tx.data);

  try {
    return signer!.signTransaction(tx);
  } catch (e) {
    // Many JSON-RPC providers, Ethers included, will not let you directly
    // sign transactions, which is necessary to re-encrypt the calldata!
    // Throw an error here to prevent calls which should've been encrypted
    // from being submitted unencrypted.
    throw new CallError(REPACK_ERROR, e);
  }
}

// -----------------------------------------------------------------------------
// Determine if the CBOR encoded calldata is a signed query or an evelope

interface SignedQuery {
  data: Envelope;
  leash: Leash;
  signature: Uint8Array;
}
type SignedQueryOrEnvelope = Envelope | SignedQuery;

function isSignedQuery(x: SignedQueryOrEnvelope): x is SignedQuery {
  return 'data' in x && 'leash' in x && 'signature' in x;
}

function isCalldataEnveloped(calldata: BytesLike, allowSignedQuery: boolean) {
  try {
    const outer_envelope = cbor.decode(
      getBytes(calldata),
    ) as SignedQueryOrEnvelope;
    let envelope: Envelope;
    if (isSignedQuery(outer_envelope)) {
      if (!allowSignedQuery) {
        throw new EnvelopeError('Got unexpected signed query!');
      }
      envelope = outer_envelope.data;
    } else {
      envelope = outer_envelope;
    }
    if (!envelopeFormatOk(envelope)) {
      throw new EnvelopeError(
        'Bogus Sapphire enveloped data found in transaction!',
      );
    }
    return true;
  } catch (e: any) {
    if (e instanceof EnvelopeError) throw e;
  }
  return false;
}

function envelopeFormatOk(envelope: Envelope): boolean {
  const { format, body, ...extra } = envelope;

  if (Object.keys(extra).length > 0) return false;

  if (!body) return false;

  if (format != null && format !== CipherKind.Plain) {
    if (isBytesLike(body)) return false;

    if (!isBytesLike(body.data)) return false;
  }

  return true;
}

// -----------------------------------------------------------------------------
// Fetch calldata public key
// Well use provider when possible, and fallback to HTTP(S)? requests
// e.g. MetaMask doesn't allow the oasis_callDataPublicKey JSON-RPC method

type CallDataPublicKeyResponse = {
  result: {
    key: string;
    checksum: string;
    signature: string;
    epoch: number;
  };
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
      res.on('error', (err: any) => reject(err));
      res.on('data', (chunk: any) => chunks.push(chunk));
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
  const fetchImpl = opts?.fetch ?? globalThis?.fetch;
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
  if (provider) {
    let resp: any;
    // It's probably an EIP-1193 provider
    if ('request' in provider) {
      try {
        const source = provider as EIP1193Provider;
        resp = await source.request({
          method: OASIS_CALL_DATA_PUBLIC_KEY,
          params: [],
        });
      } catch (ex) {
        // don't do anything, move on to try next
      }
    }
    // If it's a `send` provider
    else if ('send' in provider) {
      try {
        const source = provider as {
          send: (method: string, params: any[]) => Promise<any>;
        };
        resp = await source.send(OASIS_CALL_DATA_PUBLIC_KEY, []);
      } catch (ex) {
        // don't do anything, move on to try chainId fetch
      }
    }
    if (resp && 'key' in resp) {
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
