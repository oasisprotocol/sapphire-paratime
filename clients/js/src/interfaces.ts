import { AbstractSigner, Block, Eip1193Provider, JsonRpcProvider, Provider, Signer, TransactionRequest } from 'ethers';
import { BigNumber, ethers as ethersv5 } from 'ethersv5';
import { EthCall } from '@oasisprotocol/sapphire-paratime/signed_calls';
import { UpstreamProvider } from '@oasisprotocol/sapphire-paratime/compat';

export type Ethers5Signer = typeof ethersv5.Signer
export type EthersSigner = Signer

export type Ethers5Provider = typeof ethersv5.providers.Provider
export type EthersProvider = Provider

export type SendProvider = {
  send?: Send;
};

export type Send = (method: string, params: any[]) => Promise<unknown>;

export type JsonRpcId = string | number | undefined;
export type JsonRpcResult = string | number | boolean | Record<string, unknown>;
export type JsonRpcIdentifier = string & ('2.0' | '1.0');

export type Web3ReqArgs = {
  readonly method: string;
  readonly params?: any[];
};
export type StrictWeb3ReqArgs = {
  readonly jsonrpc: JsonRpcIdentifier;
  readonly id: JsonRpcId;
  readonly method: string;
  readonly params?: any[];
};

export async function undefer<T>(obj: ethersv5.utils.Deferrable<T>): Promise<T> {
  return Object.fromEntries(
    await Promise.all(Object.entries(obj).map(async ([k, v]) => [k, await v])),
  );
}

export type EthersCallInput = EthCall | TransactionRequest;
type EthersCallOutput = bigint | BigNumber | string | undefined;
export type EthersCall = (tx: EthersCallInput) => Promise<EthersCallOutput>;

export function isEthers5Signer(upstream: object): upstream is ethersv5.VoidSigner {
  return Reflect.get(upstream, '_isSigner') === true;
}

export function isEthers6Signer(upstream: object): upstream is EthersSigner {
  // XXX: this will not match if installed ethers version is different!
  return upstream instanceof AbstractSigner;
}

export function isEthersSigner(upstream: object): upstream is EthersSigner & Ethers5Signer {
  return isEthers5Signer(upstream) || isEthers6Signer(upstream);
}

export function isEthers5Provider(upstream: object): upstream is Ethers5Provider {
  return Reflect.get(upstream, '_isProvider') === true;
}

function isEthers6Provider(upstream: Partial<EthersProvider>): upstream is EthersProvider {
  return !!upstream.provider;
}

export function isEthersProvider(
  upstream: object,
): upstream is EthersProvider | Ethers5Provider {
  return isEthers5Provider(upstream) || isEthers6Provider(upstream);
}

export function isEip1193Provider(upstream: object | null): upstream is Eip1193Provider {
  return !!upstream && 'request' in upstream;
}

export function isJsonRpcProvider(upstream: object | null): upstream is JsonRpcProvider {
  return !!upstream && 'send' in upstream;
}

export function isSupportedProvider(upstream: UpstreamProvider | null): upstream is Eip1193Provider | JsonRpcProvider {
  return isEip1193Provider(upstream) || isJsonRpcProvider(upstream);
}

export function getProvider(upstream: UpstreamProvider | null): Eip1193Provider | JsonRpcProvider | undefined {
  return isSupportedProvider(upstream) ? upstream : undefined;
}

export function isOasisCallDataPublicKeyResponse(response: object | undefined) {
  return !!response && 'key' in response;
}

export { Block }
