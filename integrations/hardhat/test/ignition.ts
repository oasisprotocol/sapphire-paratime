import hre from 'hardhat';
import { expect } from 'chai';
import ExampleModule from '../ignition/modules/ExampleModule';
import { Wallet, ZeroAddress } from 'ethers';

// Use second account to avoid conflicts with other tests.
const DEPLOYER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

describe('Sapphire Hardhat Ignition (Ethers)', () => {
  it('Deployment', async function () {
    const contract = (
      await hre.ignition.deploy(ExampleModule, { defaultSender: DEPLOYER })
    ).example;
    // Contract is deployed
    expect(contract).to.not.be.undefined;
    expect(contract).to.not.be.null;
    const addr = await contract.getAddress();
    expect(addr).lengthOf(42);
  });

  it('Can change owner', async () => {
    const contract = (
      await hre.ignition.deploy(ExampleModule, { defaultSender: DEPLOYER })
    ).example;

    // Retrieve current owner
    const ownerFn = contract.getFunction('owner');
    const oldOwner = await ownerFn();

    // Add a coment (sends encrypted transaction)
    const randAddr = Wallet.createRandom().address;
    const setOwnerFn = contract.getFunction('setOwner');
    const zeroOwnerTx = await setOwnerFn.send(randAddr);
    await zeroOwnerTx.wait();

    // Verify owner has changed
    const newOwner = await ownerFn();
    expect(oldOwner).not.eq(newOwner);
    expect(newOwner).eq(randAddr);
  });

  it('revertWithReason', async () => {
    const contract = (
      await hre.ignition.deploy(ExampleModule, { defaultSender: DEPLOYER })
    ).example;
    const revertWithReason = contract.getFunction('revertWithReason');
    const reason = 'ThisIsAnError';
    await expect(revertWithReason(reason)).to.be.revertedWith(reason);
  });

  it('revertWithCustomError', async () => {
    const contract = (
      await hre.ignition.deploy(ExampleModule, { defaultSender: DEPLOYER })
    ).example;
    const revertWithCustomError = contract.getFunction('revertWithCustomError');
    const reason = 'CustomErrorReason';
    const errorName = 'CustomError123';
    await expect(revertWithCustomError(reason))
      .to.be.revertedWithCustomError(contract, errorName)
      .withArgs(reason, ZeroAddress);
  });
});
