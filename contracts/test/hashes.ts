import { expect } from 'chai';
import { randomBytes, createHash } from 'crypto';
import { ethers } from 'hardhat';
import { HashTests } from '../typechain-types/contracts/tests/HashTests';
import { HashTests__factory } from '../typechain-types/factories/contracts/tests';
import { BytesLike, Overrides } from 'ethers';

type HasherTestT = (
  data: BytesLike,
  overrides?: Overrides | undefined,
) => Promise<string>;

describe('Hashes', () => {
  let contract: HashTests;

  before(async () => {
    const factory = (await ethers.getContractFactory(
      'HashTests',
    )) as HashTests__factory;
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
});
