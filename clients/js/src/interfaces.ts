export type Deferrable<T> = {
  [K in keyof T]: T[K] | Promise<T[K]>;
};

type Ethers5BlockTag = string | number;

export interface _Ethers5Block {
  hash: string;
  parentHash: string;
  number: number;
  timestamp: number;
  nonce: string;
  difficulty: number;
  miner: string;
  extraData: string;
}

export interface Block extends _Ethers5Block {
  transactions: Array<string>;
}

export type Ethers5Signer = {
  connect(provider: any): any;
  sendTransaction(transaction: Deferrable<any>): Promise<any>;
  signTransaction(transaction: Deferrable<any>): Promise<string>;
  call(transaction: Deferrable<any>, blockTag?: any): Promise<string>;
  estimateGas(transaction: Deferrable<any>): Promise<any>;
  getAddress(): Promise<string>;
  provider?: any;
};

export type Ethers5Network = {
  name: string;
  chainId: number | bigint;
  ensAddress?: string;
  _defaultProvider?: (providers: any, options?: any) => any;
};

export type Ethers5Provider = {
  getTransactionCount(addressOrName: any, blockTag?: any): Promise<number>;
  call(
    transaction: Deferrable<any>,
    blockTag?: Ethers5BlockTag | Promise<Ethers5BlockTag>,
  ): Promise<string>;
  estimateGas(transaction: Deferrable<any>): Promise<any>;
  getNetwork(): Promise<Ethers5Network>;
  getBlock(blockHashOrBlockTag: any): Promise<any>;
};

export type EIP1193Provider = {
  request: (args: StrictWeb3ReqArgs | Web3ReqArgs) => Promise<unknown>;
};

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

export async function undefer<T>(obj: Deferrable<T>): Promise<T> {
  return Object.fromEntries(
    await Promise.all(Object.entries(obj).map(async ([k, v]) => [k, await v])),
  );
}

export type UpstreamProvider =
  | EIP1193Provider
  | Ethers5Signer
  | Ethers5Provider;
