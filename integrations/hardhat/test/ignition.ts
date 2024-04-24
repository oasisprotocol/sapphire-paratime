import hre from 'hardhat';
import { expect } from 'chai';
import ExampleModule from '../ignition/modules/ExampleModule';
import { Wallet } from 'ethers';

describe('Sapphire Hardhat Ignition (Ethers)', () => {
  it('Deployment', async function () {
    const contract = (await hre.ignition.deploy(ExampleModule)).example;
    // Contract is deployed
    expect(contract).to.not.be.undefined;
    expect(contract).to.not.be.null;
    const addr = await contract.getAddress();
    expect(addr).lengthOf(42);
  });

  it('Can change owner', async function () {
    const contract = (await hre.ignition.deploy(ExampleModule)).example;

    const oldOwner = await contract.getFunction('owner')();

    // Add a coment (sends encrypted transaction)
    const randAddr = Wallet.createRandom().address;
    const setOwnerFn = contract.getFunction('setOwner');
    const zeroOwnerTx = await setOwnerFn.send(randAddr);
    await zeroOwnerTx.wait();

    // Verify owner has changed
    const newOwner = await contract.getFunction('owner')();
    expect(oldOwner).not.eq(newOwner);
    expect(newOwner).eq(randAddr);
  });
});
