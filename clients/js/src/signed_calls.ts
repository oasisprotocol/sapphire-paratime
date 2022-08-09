import { BlockTag } from '@ethersproject/abstract-provider';
import {
  Signer,
  TypedDataDomain,
  TypedDataField,
  TypedDataSigner,
} from '@ethersproject/abstract-signer';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { BytesLike, arrayify, hexlify } from '@ethersproject/bytes';
import * as cbor from 'cborg';
import type {
  CamelCasedProperties,
  Promisable,
  RequireExactlyOne,
  SetRequired,
} from 'type-fest';

const DEFAULT_GAS_PRICE = 0;
const DEFAULT_GAS_LIMIT = 0;
const DEFAULT_VALUE = 0;
const DEFAULT_DATA = '0x';
const zeroAddress = () => `0x${'0'.repeat(40)}`;

export function signedCallEIP712Params(chainId: number): {
  domain: TypedDataDomain;
  types: Record<string, TypedDataField[]>;
} {
  return {
    domain: {
      name: 'oasis-runtime-sdk/evm: signed query',
      version: '1.0.0',
      chainId,
    },
    types: {
      Call: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'gasLimit', type: 'uint64' },
        { name: 'gasPrice', type: 'uint256' },
        { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' },
        { name: 'leash', type: 'Leash' },
      ],
      Leash: [
        { name: 'nonce', type: 'uint64' },
        { name: 'blockNumber', type: 'uint64' },
        { name: 'blockHash', type: 'bytes32' },
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
): Promise<SignedCall> {
  if (!call.from) {
    throw TypeError('signed call must have a sender');
  }
  const leash = await makeLeash(signer, overrides?.leash);
  const extPack: SignedCallDataPack = {
    data: call.data ? { body: arrayify(call.data) } : undefined,
    leash,
    signature: await signCall(makeSignableCall(call, leash), signer, {
      chainId: overrides?.chainId,
    }),
  };
  return {
    ...call,
    data: hexlify(cbor.encode(extPack)),
  };
}

async function makeLeash(
  signer: Signer & TypedDataSigner,
  overrides?: LeashOverrides,
): Promise<Leash> {
  const nonceP = overrides?.nonce
    ? overrides.nonce
    : signer.getTransactionCount('pending');
  let blockP: Promisable<BlockId>;
  if (overrides?.block !== undefined) {
    blockP = overrides.block;
  } else {
    if (signer.provider === undefined) {
      throw new Error(
        'unable to locate base block, as a provider is not connected',
      );
    }
    const blockTag = overrides?.blockTag ?? 'latest';
    blockP = signer.provider.getBlock(blockTag);
  }
  const [nonce, block] = await Promise.all([nonceP, blockP]);
  return {
    nonce,
    block_number: block.number,
    block_hash: arrayify(block.hash),
    block_range: overrides?.blockRange ?? 15 /* ~90s */,
  };
}

export function makeSignableCall(call: EthCall, leash: Leash): SignableEthCall {
  return {
    from: call.from,
    to: call.to ?? zeroAddress(),
    gasLimit: BigNumber.from(
      call.gas ?? call.gasLimit ?? DEFAULT_GAS_LIMIT,
    ).toNumber(),
    gasPrice: BigNumber.from(call.gasPrice ?? DEFAULT_GAS_PRICE),
    value: BigNumber.from(call.value ?? DEFAULT_VALUE),
    data: call.data
      ? hexlify(call.data, { allowMissingPrefix: true })
      : DEFAULT_DATA,
    leash: {
      nonce: leash.nonce,
      blockNumber: leash.block_number,
      blockHash: leash.block_hash,
      blockRange: leash.block_range,
    },
  };
}

async function signCall(
  call: SignableEthCall,
  signer: Signer & TypedDataSigner,
  overrides?: Partial<{ chainId: number }>,
): Promise<Uint8Array> {
  const chainId = overrides?.chainId ?? (await signer.getChainId());
  if (!overrides?.chainId && chainId !== 0x5afe && chainId !== 0x5aff) {
    throw new Error(
      'Signed queries can only be sent to Sapphire or Sapphire Testnet. Please check your Web3 provider connection.',
    );
  }
  const { domain, types } = signedCallEIP712Params(chainId);
  return arrayify(await signer._signTypedData(domain, types, call));
}

export type PrepareSignedCallOverrides = Partial<{
  leash: LeashOverrides;
  chainId: number;
}>;

export type LeashOverrides = Partial<
  {
    nonce: number;
    blockRange: number;
  } & RequireExactlyOne<{
    block: BlockId;
    blockTag: BlockTag;
  }>
>;

export type EthCall = {
  /** 0x-prefixed hex-encoded address. */
  from: string;
  /** Optional 0x-prefixed hex-encoded address. */
  to?: string;
  value?: BigNumberish;
  gasPrice?: BigNumberish;
  data?: BytesLike;
} & Partial<
  RequireExactlyOne<{
    gas: number | string; // web3.js
    gasLimit: BigNumberish; // ethers
  }>
>;

export type SignedCall = SetRequired<EthCall, 'data'>;

/**
 * Parameters that define a signed call that shall be
 * CBOR-encoded and sent as the call's `data` field.
 */
export type SignedCallDataPack = {
  /**
   * An oasis-sdk `Call` without the optional fields.
   *
   * After encryption, `body` would be encryped and this field would contain a
   * `format` field. The runtime would decode the data as a `types::transaction::Call`.
   **/
  data?: { body: Uint8Array };
  leash: Leash;
  /** A signature over the call and leash as generated by `signCall`. */
  signature: Uint8Array;
};

/**
 * The structure passed to eth_signTypedData_v4.
 *
 * `uint256`, `address`, and `bytes` are required to be hex-stringified.
 */
export type SignableEthCall = {
  from: string;
  to: string;
  gasLimit?: number;
  gasPrice?: BigNumber;
  value?: BigNumber;
  data?: string;
  leash: CamelCasedProperties<Leash>;
};

export type Leash = {
  /** The largest sender account nonce whence the call will be valid. */
  nonce: number;
  /** The block number whence the call will be valid. */
  block_number: number; // uint64
  /** The expected block hash to be found at `block_number`. */
  block_hash: Uint8Array;
  /** The number of blocks past the block at `block_number` whence the call will be valid. */
  block_range: number; // uint64
};

type BlockId = { hash: string; number: number };
