import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignedQueriesTests } from '../typechain-types/contracts/tests/SignedQueriesTests';
import { SignedQueriesTests__factory } from '../typechain-types/factories/contracts/tests';

describe('Signed Queries', () => {
  let contract: SignedQueriesTests;

  before(async () => {
    const factory = (await ethers.getContractFactory(
      'SignedQueriesTests',
    )) as SignedQueriesTests__factory;
    contract = await factory.deploy();
    await contract.deployed();
  });

  it('Works', async () => {
    const [owner] = await ethers.getSigners();
    const who = await contract.testSignedQueries();
    expect(who).eq(await owner.getAddress());
  });
});
