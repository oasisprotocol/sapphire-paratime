import { Signer, TypedDataSigner } from '@ethersproject/abstract-signer';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { arrayify, hexlify } from '@ethersproject/bytes';
import { BN } from 'bn.js';
import * as cbor from 'cborg';
import type { RequireExactlyOne } from 'type-fest';

/**
 * Prepares a signed call that allows retrieving data scoped to the sender's account.
 * @param call The call. `from` must be set.
 * @param provider An ethers provider.
 * @return The call that should be submitted to the Web3 gateway.
 */
export async function prepareSignedCall(
  call: EthCall,
  provider: Signer & TypedDataSigner,
): Promise<{ to: string; data: string }> {
  const caller = call.from;
  const simulateCallQuery: SimulateCallQuery = {
    caller: toBEBytes(caller, 20),
    address: toBEBytes(call.to, 20),
    value: call.value ? toBEBytes(call.value, 32) : undefined,
    gas_price: toBEBytes(call.gas ?? call.gasLimit, 32),
    gas_limit: call.gasLimit
      ? BigNumber.from(call.gasLimit).toNumber()
      : undefined,
    data: call.data
      ? arrayify(call.data, { allowMissingPrefix: true })
      : undefined,
    nonce: await provider.getTransactionCount('pending'),
  };
  const signature = await signCall(simulateCallQuery, provider);
  const envelopedSignedCall = {
    call: simulateCallQuery,
    signature,
  };
  return {
    to: '0x0000000000000000000000000000000000000000', // This field is required, but not needed by Sapphire, so we set it to something uninformative.
    data: hexlify(cbor.encode(envelopedSignedCall)),
  };
}

async function signCall(
  call: SimulateCallQuery,
  signer: Signer & TypedDataSigner,
): Promise<Uint8Array> {
  const chainId = await signer.getChainId();
  if (chainId !== 0x5afe && chainId !== 0x5aff) {
    throw new Error(
      'Signed queries can only be sent to Sapphire or Sapphire Testnet. Please check your Web3 provider connection.',
    );
  }
  const domain = {
    name: 'sapphire-paratime',
    version: '1.0.0',
    chainId,
  };
  const types = {
    Call: [
      { name: 'gas_price', type: 'uint256' },
      { name: 'gas_limit', type: 'uint64' },
      { name: 'caller', type: 'address' },
      { name: 'address', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'nonce', type: 'uint64' },
    ],
  };
  return arrayify(await signer._signTypedData(domain, types, call));
}

function toBEBytes(bn: BigNumberish, length: number): Uint8Array {
  const hex = BigNumber.from(bn).toHexString().substring(2);
  return new BN(hex, 16).toArrayLike(
    Uint8Array as any, // The manual decl isn't as general as the impl.
    'be',
    length,
  );
}

export type EthCall = {
  from: string;
  to: string;
  value?: BigNumberish;
  gasPrice?: BigNumberish;
  data?: Uint8Array | string;
} & RequireExactlyOne<{
  gas?: number | string; // web3.js
  gasLimit?: BigNumberish; // ethers
}>;

type SimulateCallQuery = {
  gas_price?: Uint8Array; // U256
  gas_limit?: number; // U64
  caller: Uint8Array; // H160
  address: Uint8Array; // H160
  value?: Uint8Array; // U256
  data?: Uint8Array; // bytes
  nonce: number; // u64
};
