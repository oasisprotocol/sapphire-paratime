import { arrayify, hexlify } from '@ethersproject/bytes';
import * as cbor from 'cborg';
import { BigNumber, Wallet, ethers } from 'ethers';

import {
  PrepareSignedCallOverrides,
  SignableEthCall,
  SignedQueryEnvelope,
  SimulateCallQuery,
  prepareSignedCall,
  signedCallEIP712Params,
} from '@oasislabs/sapphire-paratime/signed_calls';

const CHAIN_ID = 0x5afe;

describe('signed calls', () => {
  // 0x11e244400Cf165ade687077984F09c3A037b868F
  const from = new Wallet(
    '0x8160d68c4bf9425b1d3a14dc6d59a99d7d130428203042a8d419e68d626bd9f2',
  );
  const to = '0xb5ed90452AAC09f294a0BE877CBf2Dc4D55e096f';

  const overrides: PrepareSignedCallOverrides = {
    leash: {
      nonce: 999,
      block: {
        hash: '0xc92b675c7013e33aa88feaae520eb0ede155e7cacb3c4587e0923cba9953f8bb',
        number: 42,
      },
      blockRange: 3,
    },
    chainId: CHAIN_ID,
  };

  it('signs', async () => {
    const call = {
      from: from.address,
      to,
      value: 42,
      gasPrice: 123,
      gasLimit: 10,
      data: [1, 2, 3, 4],
    };

    const signedCall = await prepareSignedCall(call, from, overrides);

    const envelopedQuery: SignedQueryEnvelope = cbor.decode(
      arrayify(signedCall.data),
    );

    // Validate the structure.
    const simulateCallQuery = envelopedQuery.query;
    expect(simulateCallQuery.caller).toEqual(arrayify(call.from));
    expect(simulateCallQuery.address).toEqual(arrayify(call.to));
    expect(simulateCallQuery.value).toEqual(u8To256(call.value));
    expect(simulateCallQuery.gas_price).toEqual(u8To256(call.gasPrice));
    expect(simulateCallQuery.gas_limit).toEqual(call.gasLimit);
    expect(simulateCallQuery.data).toEqual(new Uint8Array(call.data));
    expect(simulateCallQuery.leash.nonce).toEqual(overrides.leash?.nonce);
    expect(simulateCallQuery.leash.block_number).toEqual(
      overrides.leash!.block!.number,
    );
    expect(hexlify(simulateCallQuery.leash.block_hash)).toEqual(
      overrides.leash!.block!.hash!,
    );
    expect(simulateCallQuery.leash.block_range).toEqual(
      overrides.leash?.blockRange,
    );
    // Validate the signature.
    const recoveredSigner = verify(envelopedQuery);
    expect(recoveredSigner).toEqual(from.address);
  });

  it('partial', async () => {
    const call = {
      from: from.address,
      to,
    };

    const signedCall = await prepareSignedCall(call, from, overrides);

    const envelopedQuery = cbor.decode(arrayify(signedCall.data));
    const recoveredSigner = verify(envelopedQuery);
    expect(recoveredSigner).toEqual(from.address);
  });
});

function verify({ query, signature }: SignedQueryEnvelope): string {
  const { domain, types } = signedCallEIP712Params(CHAIN_ID);
  const decoded = decodeSimulateCallQuery(query);
  return ethers.utils.verifyTypedData(domain, types, decoded, signature);
}

function decodeSimulateCallQuery(query: SimulateCallQuery): SignableEthCall {
  return {
    from: hexlify(query.caller),
    to: hexlify(query.address),
    value: query.value ? BigNumber.from(query.value) : undefined,
    gasPrice: query.gas_price ? BigNumber.from(query.gas_price) : undefined,
    gasLimit: query.gas_limit,
    data: query.data ? hexlify(query.data) : undefined,
    leash: {
      nonce: query.leash.nonce,
      blockNumber: query.leash.block_number,
      blockHash: query.leash.block_hash,
      blockRange: query.leash.block_range,
    },
  };
}

function u8To256(u8: number): Uint8Array {
  const u256 = new Uint8Array(32);
  u256[31] = u8;
  return u256;
}
