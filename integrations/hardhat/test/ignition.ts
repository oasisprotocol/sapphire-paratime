import hre from 'hardhat';
import { expect } from 'chai';
import ExampleModule from '../ignition/modules/ExampleModule';
import { Wallet, ZeroAddress } from 'ethers';

describe('Sapphire Hardhat Ignition (Ethers)', () => {
  it('Deployment', async function () {
    const contract = (await hre.ignition.deploy(ExampleModule)).example;
    // Contract is deployed
    expect(contract).to.not.be.undefined;
    expect(contract).to.not.be.null;
    const addr = await contract.getAddress();
    expect(addr).lengthOf(42);
  });

  it('Can change owner', async () => {
    const contract = (await hre.ignition.deploy(ExampleModule)).example;

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
    const contract = (await hre.ignition.deploy(ExampleModule)).example;
    const revertWithReason = contract.getFunction('revertWithReason');
    const reason = 'ThisIsAnError';
    await expect(revertWithReason(reason)).to.be.revertedWith(reason);
  });

  it('revertWithCustomError', async () => {
    const contract = (await hre.ignition.deploy(ExampleModule)).example;
    const revertWithCustomError = contract.getFunction('revertWithCustomError');
    const reason = 'CustomErrorReason';
    const errorName = 'CustomError123';
    await expect(revertWithCustomError(reason))
      .to.be.revertedWithCustomError(contract, errorName)
      .withArgs(reason, ZeroAddress);
  });
});
