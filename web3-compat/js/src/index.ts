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
import type { RequireExactlyOne } from 'type-fest';

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
        { name: 'nonce', type: 'uint64' },
      ],
    },
  };
}

/** Prepares a signed call that allows retrieving data scoped to the sender's account. */
export async function prepareSignedCall(
  call: EthCall,
  signer: Signer & TypedDataSigner,
  overrides?: Partial<{
    nonce: number;
    chainId: number;
  }>,
): Promise<{ to: string; data: string }> {
  if (!call.from || !call.to) {
    throw TypeError('signed call must have a sender and recipient');
  }
  const leash: Leash = {
    nonce: overrides?.nonce ?? (await signer.getTransactionCount('pending')),
  };

  const envelopedQuery: SignedQueryEnvelope = {
    query: {
      ...makeSimulateCallQuery(call),
      ...leash,
    },
    signature: await signCall({ ...makeSignableCall(call), ...leash }, signer, {
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

export function makeSignableCall(call: EthCall): SignableEthCall {
  return {
    from: call.from,
    to: call.to,
    value: map(call.value, BigNumber.from),
    gasPrice: map(call.gasPrice, BigNumber.from),
    gasLimit: map(call.gas ?? call.gasLimit, BigNumber.from)?.toNumber(),
    data: map(call.data, (v) => hexlify(v, { allowMissingPrefix: true })),
  };
}

export function makeSimulateCallQuery(call: EthCall): SimulateCallQuery {
  return {
    caller: toBEBytes(call.from, 20),
    address: toBEBytes(call.to, 20),
    value: map(call.value, (v) => toBEBytes(v, 32)),
    gas_price: map(call.gasPrice, (v) => toBEBytes(v, 32)),
    gas_limit: map(call.gas ?? call.gasLimit, BigNumber.from)?.toNumber(),
    data: map(call.data, (v) => arrayify(v, { allowMissingPrefix: true })),
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
  call: SignableEthCall & Leash,
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
};

export type Leash = {
  nonce: number;
};

export type SignedQueryEnvelope = {
  query: SimulateCallQuery & Leash;
  signature: Uint8Array;
};

export type SimulateCallQuery = {
  gas_price?: Uint8Array; // U256
  gas_limit?: number; // U64
  caller: Uint8Array; // H160
  address: Uint8Array; // H160
  value?: Uint8Array; // U256
  data?: Uint8Array; // bytes
};
