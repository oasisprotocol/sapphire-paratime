import { expect } from 'chai';
import { randomBytes, createHash } from 'crypto';
import { ethers } from 'hardhat';
import { HashTests } from '../typechain-types/contracts/tests/HashTests';
import { BytesLike, hexlify, Overrides } from 'ethers';
import { sha512_256 } from '@noble/hashes/sha512';
import { hmac } from '@noble/hashes/hmac';

type HasherTestT = (data: BytesLike, overrides?: Overrides) => Promise<string>;

describe('Hashes', () => {
  let contract: HashTests;

  before(async () => {
    const factory = await ethers.getContractFactory('HashTests');
    contract = await factory.deploy();
    await contract.waitForDeployment();
  });

  async function testHashes(algname: string, method: HasherTestT) {
    for (let i = 0; i < 512; i += 64) {
      const data = randomBytes(i);
      const hash = createHash(algname).update(data).digest('hex');
      const result = await method(data);
      expect(result).eq('0x' + hash);
    }
  }

  it('SHA512-256', async () => {
    await testHashes('SHA512-256', contract.testSHA512_256.bind(contract));
  });

  it('SHA512', async () => {
    await testHashes('SHA512', contract.testSHA512.bind(contract));
  });

  it('SHA384', async () => {
    await testHashes('SHA384', contract.testSHA384.bind(contract));
  });

  it('HMAC SHA512-256', async () => {
    for (let i = 0; i < 1024; i = i + (1 + i / 5)) {
      const key = randomBytes(i);
      for (let j = 0; j < 1024; j = j + (1 + j / 5)) {
        const msg = randomBytes(j);
        const expected = new Uint8Array(
          hmac.create(sha512_256, key).update(msg).digest().buffer,
        );
        const actual = await contract.testHMAC_SHA512_256(key, msg);
        expect(hexlify(actual)).eq(hexlify(expected));
      }
    }
  });
});
