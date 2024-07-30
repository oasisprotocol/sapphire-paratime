import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ZeroAddress } from 'ethers';

import { isCalldataEnveloped } from '@oasisprotocol/sapphire-paratime';

import { Example, Example__factory } from '../typechain-types';

describe('Example', function () {
  let factory: Example__factory;
  let example: Example;

  before(async () => {
    factory = await ethers.getContractFactory('Example');
  });

  /// Constructors are unencrypted by default, even with sapphire-hardhat
  it('Constructor is public', async function () {
    example = await (await factory.deploy(ZeroAddress)).waitForDeployment();
    const dt = example.deploymentTransaction();
    expect(dt).is.not.undefined;
    if (dt) {
      expect(isCalldataEnveloped(dt.data)).to.be.true;
    }
  });

  /// All other transactions will be encrypted
  it('Transaction calldata is encrypted', async () => {
    const [, anotherSigner] = await ethers.getSigners();

    const oldOwner = await example.owner();
    expect(oldOwner).to.eq(ZeroAddress);

    const z = await example.setOwner(anotherSigner.address);
    expect(isCalldataEnveloped(z.data)).to.be.true;
    await z.wait();

    const newOwner = await example.owner();
    expect(newOwner).to.not.eq(oldOwner);
    expect(newOwner).to.eq(anotherSigner.address);
  });

  /// Verify error reasons can be tested using chai
  it('Error string in view call', async () => {
    const reason = 'ThisIsAnError';
    await expect(example.revertWithReason(reason)).to.be.revertedWith(reason);
  });

  /// Verify custom solidity errors can be tested using chai
  it('Custom revert in view call', async () => {
    const reason = 'CustomErrorReason';
    const errorName = 'CustomError123';
    await expect(example.revertWithCustomError(reason))
      .to.be.revertedWithCustomError(example, errorName)
      .withArgs(reason, ZeroAddress);
  });

  /// Verifies that getSigners() returns wrapped providers
  it('Has multiple wrapped signers', async () => {
    const signers = await ethers.getSigners();
    let correctDeploys = 0;
    for (const s of signers) {
      const balance = await ethers.provider.getBalance(s.address);
      if (balance == 0n) {
        continue;
      }
      const f = factory.connect(s);
      const c = await (await f.deploy(ZeroAddress)).waitForDeployment();
      const dt = c.deploymentTransaction();
      expect(dt).is.not.undefined;
      if (dt) {
        expect(isCalldataEnveloped(dt.data)).to.be.true;
        expect(dt.from).to.eq(s.address);
        correctDeploys += 1;
      }
    }
    expect(correctDeploys).to.be.greaterThanOrEqual(2);
  });
});
