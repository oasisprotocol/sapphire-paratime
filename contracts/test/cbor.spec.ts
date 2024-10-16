import * as cborg from 'cborg';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { TestCBOR } from '../typechain-types';
import { getBytes, hexlify, randomBytes, toQuantity } from 'ethers';
import { encode as cborEncode, decode as cborDecode } from 'cborg';

describe('CBOR', () => {
  let contract: TestCBOR;

  before(async () => {
    const factory = await ethers.getContractFactory('TestCBOR');

    contract = await factory.deploy();
  });

  it('Uint encoding', async () => {
    // NOTE: native bigint encoding beyond 64bit isn't supported by cborg lib
    for (let i = 0n; i < 1n << 64n; i = i + 1n + i / 2n) {
      const result = getBytes(await contract.testUintEncoding(i));
      expect(BigInt(cborDecode(getBytes(result)))).equal(i);
      expect(await contract.testUintRoundtrip(i)).eq(true);
      expect(hexlify(cborEncode(i))).eq(hexlify(result));
    }
  });

  it('Bytes encoding', async () => {
    for (let i = 0; i <= 16; i += 1) {
      const nBytes = (1 << i) - 1;
      const input = randomBytes(nBytes);
      const result = await contract.testBytesEncoding(input);
      const output = cborDecode(getBytes(result));
      expect(hexlify(output)).eq(hexlify(input));
      expect(hexlify(cborEncode(input))).eq(hexlify(result));
    }
  });

  it('Bytes encoding (errors)', async () => {
    const length = 0xffff + 1;
    const bytes = randomBytes(length);
    await expect(contract.testBytesEncoding(bytes)).revertedWithCustomError(
      contract,
      'CBOR_Error_BytesTooLong',
    );
  });

  /// Verifies that bigints (byte encoded) can be parsed from 1 to 255 bits
  it('Parse uint (bytes)', async () => {
    for (let i = 0n; i < 256n; i += 1n) {
      const value = 1n << i;
      const hex = value.toString(16);
      const hexPadded = hex.padStart(hex.length + (hex.length % 2), '0');
      const encoded = cborEncode(getBytes(`0x${hexPadded}`));
      const [newOffset, parsedCborUint] = await contract.testParseUint(
        encoded,
        0,
      );
      expect(await contract.testUintRoundtrip(i)).eq(true);
      expect(newOffset).eq(encoded.length);
      expect(toQuantity(parsedCborUint)).eq(`0x${hex}`);
    }
  });
});
