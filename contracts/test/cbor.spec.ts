import * as cborg from 'cborg';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { TestCBOR } from '../typechain-types';
import { getBytes, hexlify, randomBytes } from 'ethers';
import { encode as cborEncode, decode as cborDecode } from 'cborg';

describe('CBOR', () => {
  let contract: TestCBOR;

  before(async () => {
    const factory = await ethers.getContractFactory('TestCBOR');

    contract = await factory.deploy();
  });

  it('Uint encoding', async () => {
    // XXX: encoding beyond 64bit uints isn't 100% supported
    for (let i = 0n; i < 1n << 64n; i = i + 1n + i / 2n) {
      const result = getBytes(await contract.testUintEncoding(i));
      expect(BigInt(cborDecode(getBytes(result)))).equal(i);
      expect(await contract.testUintRoundtrip(i)).eq(true);
      expect(hexlify(cborEncode(i))).eq(hexlify(result));
    }
  });

  it('Bytes encoding', async () => {
    for (let i = 0; i < 2048; i = i + (1 + i / 10)) {
      const input = randomBytes(i);
      const result = await contract.testBytesEncoding(input);
      const output = cborDecode(getBytes(result));
      expect(hexlify(output)).eq(hexlify(input));
      expect(hexlify(cborEncode(input))).eq(hexlify(result));
    }
  });

  it('Parse uint8', async () => {
    const MAX_SAFE_UINT8 = (1n << 8n) - 1n;

    // bytes = 0x18FF
    const bytes = cborg.encode(MAX_SAFE_UINT8);

    const [newOffset, parsedCborUint] = await contract.testParseUint(bytes, 0);

    expect(parsedCborUint).eq(MAX_SAFE_UINT8);
    expect(newOffset).eq(1 + 1);

    expect(await contract.testUintRoundtrip(MAX_SAFE_UINT8)).eq(true);
  });

  it('Parse uint16', async () => {
    const MAX_SAFE_UINT16 = (1n << 16n) - 1n;

    // bytes = 0x19FFFF
    const bytes = cborg.encode(MAX_SAFE_UINT16);

    const [newOffset, parsedCborUint] = await contract.testParseUint(bytes, 0);

    expect(parsedCborUint).eq(MAX_SAFE_UINT16);
    expect(newOffset).eq(2 + 1);

    expect(await contract.testUintRoundtrip(MAX_SAFE_UINT16)).eq(true);
  });

  it('Parse uint32', async () => {
    const MAX_SAFE_UINT32 = (1n << 32n) - 1n;

    // bytes = 0x1AFFFFFFFF
    const bytes = cborg.encode(MAX_SAFE_UINT32);

    const [newOffset, parsedCborUint] = await contract.testParseUint(bytes, 0);

    expect(parsedCborUint).eq(MAX_SAFE_UINT32);
    expect(newOffset).eq(4 + 1);

    expect(await contract.testUintRoundtrip(MAX_SAFE_UINT32)).eq(true);
  });

  it('Parse uint64', async () => {
    const MAX_SAFE_UINT64 = (1n << 64n) - 1n;

    // bytes = 0x1BFFFFFFFFFFFFFFFF
    const bytes = cborg.encode(MAX_SAFE_UINT64);

    const [newOffset, parsedCborUint] = await contract.testParseUint(bytes, 0);

    expect(parsedCborUint).eq(MAX_SAFE_UINT64);
    expect(newOffset).eq(8 + 1);

    expect(await contract.testUintRoundtrip(MAX_SAFE_UINT64)).eq(true);
  });

  it('Parse uint128', async () => {
    const MAX_SAFE_UINT128 = (1n << 128n) - 1n;

    const hex = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';
    const uint128bytes = Uint8Array.from(
      Buffer.from(hex.replace('0x', ''), 'hex'),
    );

    const bytes = cborg.encode(uint128bytes);

    const [newOffset, parsedCborUint] = await contract.testParseUint(bytes, 0);

    expect(parsedCborUint).eq(MAX_SAFE_UINT128);
    expect(newOffset).eq(16 + 1);

    //expect(await contract.testUintRoundtrip(MAX_SAFE_UINT128)).eq(true);
  });

  it('Should successfully parse CBOR uint256', async () => {
    const MAX_SAFE_UINT256 = (1n << 256n) - 1n;

    const hex =
      '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';
    const uint256bytes = Uint8Array.from(
      Buffer.from(hex.replace('0x', ''), 'hex'),
    );

    const bytes = cborg.encode(uint256bytes);

    const [newOffset, parsedCborUint] = await contract.testParseUint(bytes, 0);

    expect(parsedCborUint).eq(MAX_SAFE_UINT256);
    expect(newOffset).eq(33 + 1);

    //expect(await contract.testUintRoundtrip(MAX_SAFE_UINT256)).eq(true);
  });
});
