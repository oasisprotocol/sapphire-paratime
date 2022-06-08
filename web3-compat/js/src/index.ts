import { BlockTag } from '@ethersproject/abstract-provider';
import {
  Signer,
  TypedDataDomain,
  TypedDataField,
  TypedDataSigner,
} from '@ethersproject/abstract-signer';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { BytesLike, arrayify, hexlify } from '@ethersproject/bytes';
import { BN } from 'bn.js';
import * as cbor from 'cborg';
import type { RequireExactlyOne, SnakeCasedProperties } from 'type-fest';

export function signedCallEIP712Params(chainId: number): {
  domain: TypedDataDomain;
  types: Record<string, TypedDataField[]>;
} {
  return {
    domain: {
      name: 'Sapphire ParaTime',
      version: '1.0.0',
      chainId,
    },
    types: {
      Call: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'gasPrice', type: 'uint256' },
        { name: 'gasLimit', type: 'uint64' },
        { name: 'data', type: 'bytes' },
        { name: 'leash', type: 'Leash' },
      ],
      Leash: [
        { name: 'nonce', type: 'uint64' },
        { name: 'blockHash', type: 'uint256' },
        { name: 'blockRange', type: 'uint64' },
      ],
    },
  };
}

/** Prepares a signed call that allows retrieving data scoped to the sender's account. */
export async function prepareSignedCall(
  call: EthCall,
  signer: Signer & TypedDataSigner,
  overrides?: PrepareSignedCallOverrides,
): Promise<{ to: string; data: string }> {
  if (!call.from || !call.to) {
    throw TypeError('signed call must have a sender and recipient');
  }

  async function makeLeash(
    signer: Signer & TypedDataSigner,
    overrides?: LeashOverrides,
  ): Promise<Leash> {
    const nonceP = overrides?.nonce
      ? overrides.nonce
      : signer.getTransactionCount('pending');
    let blockHashP;
    if (overrides?.blockHash !== undefined) {
      blockHashP = overrides.blockHash;
    } else {
      if (signer.provider === undefined) {
        throw new Error(
          'unable to determine block hash, as a provider is not connected',
        );
      }
      const blockTag = overrides?.blockTag ?? 'latest';
      blockHashP = signer.provider.getBlock(blockTag).then((b) => b.hash);
    }
    const [nonce, blockHash] = await Promise.all([nonceP, blockHashP]);
    return {
      nonce,
      blockHash: arrayify(blockHash),
      blockRange: overrides?.blockRange ?? 15 /* ~90s */,
    };
  }

  const leash = await makeLeash(signer, overrides?.leash);

  const envelopedQuery: SignedQueryEnvelope = {
    query: makeSimulateCallQuery(call, leash),
    signature: await signCall(makeSignableCall(call, leash), signer, {
      chainId: overrides?.chainId,
    }),
  };
  return {
    to: '0x0000000000000000000000000000000000000000', // This field is required, but not needed by Sapphire, so we set it to something uninformative.
    data: hexlify(cbor.encode(envelopedQuery)),
  };
}

function map<T, U>(v: T | undefined, f: (v: T) => U): U | undefined {
  return v ? f(v) : undefined;
}

export function makeSignableCall(call: EthCall, leash: Leash): SignableEthCall {
  return {
    from: call.from,
    to: call.to,
    value: map(call.value, BigNumber.from),
    gasPrice: map(call.gasPrice, BigNumber.from),
    gasLimit: map(call.gas ?? call.gasLimit, BigNumber.from)?.toNumber(),
    data: map(call.data, (v) => hexlify(v, { allowMissingPrefix: true })),
    leash,
  };
}

export function makeSimulateCallQuery(
  call: EthCall,
  leash: Leash,
): SimulateCallQuery {
  return {
    caller: toBEBytes(call.from, 20),
    address: toBEBytes(call.to, 20),
    value: map(call.value, (v) => toBEBytes(v, 32)),
    gas_price: map(call.gasPrice, (v) => toBEBytes(v, 32)),
    gas_limit: map(call.gas ?? call.gasLimit, BigNumber.from)?.toNumber(),
    data: map(call.data, (v) => arrayify(v, { allowMissingPrefix: true })),
    leash: {
      nonce: leash.nonce,
      block_hash: leash.blockHash,
      block_range: leash.blockRange,
    },
  };
}

function toBEBytes(bn: BigNumberish, length: number): Uint8Array {
  const hex = BigNumber.from(bn).toHexString().substring(2);
  return new BN(hex, 16).toArrayLike(
    Uint8Array as any, // The manual decl isn't as general as the impl.
    'be',
    length,
  );
}

async function signCall(
  call: SignableEthCall,
  signer: Signer & TypedDataSigner,
  overrides?: Partial<{ chainId: number }>,
): Promise<Uint8Array> {
  const chainId = overrides?.chainId ?? (await signer.getChainId());
  if (chainId !== 0x5afe && chainId !== 0x5aff) {
    throw new Error(
      'Signed queries can only be sent to Sapphire or Sapphire Testnet. Please check your Web3 provider connection.',
    );
  }
  const { domain, types } = signedCallEIP712Params(chainId);
  types.Call = types.Call.filter(
    ({ name }) => (call as any)[name] !== undefined,
  );
  return arrayify(await signer._signTypedData(domain, types, call));
}

export type PrepareSignedCallOverrides = Partial<{
  leash: LeashOverrides;
  chainId: number;
}>;

export type LeashOverrides = Partial<{
  nonce: number;
  blockHash: string;
  blockTag: BlockTag;
  blockRange: number;
}>;

export type EthCall = {
  from: string;
  to: string;
  value?: BigNumberish;
  gasPrice?: BigNumberish;
  data?: BytesLike;
} & Partial<
  RequireExactlyOne<{
    gas: number | string; // web3.js
    gasLimit: BigNumberish; // ethers
  }>
>;

/**
 * The structure passed to eth_signTypedData_v4.
 *
 * `uint256`, `address`, and `bytes` are required to be hex-stringified.
 */
export type SignableEthCall = {
  from: string;
  to: string;
  value?: BigNumber;
  gasPrice?: BigNumber;
  gasLimit?: number;
  data?: string;
  leash: Leash;
};

export type SignedQueryEnvelope = {
  query: SimulateCallQuery;
  signature: Uint8Array; // [u8; 65]
};

export type SimulateCallQuery = {
  gas_price?: Uint8Array; // U256
  gas_limit?: number; // U64
  caller: Uint8Array; // H160
  address: Uint8Array; // H160
  value?: Uint8Array; // U256
  data?: Uint8Array; // bytes
  leash: SnakeCasedProperties<Leash>; // itself
};

export type Leash = {
  /** The largest sender account nonce for which the call will be valid. */
  nonce: number;
  /** The block hash from which the call will be valid. */
  blockHash: Uint8Array;
  /** The number of blocks past the block at `blockHahsh` for which the call will be valid. */
  blockRange: number;
};
