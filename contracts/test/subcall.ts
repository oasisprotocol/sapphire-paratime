import { ethers } from 'hardhat';
import { expect } from 'chai';
import { SubcallTests } from '../typechain-types/contracts/tests/SubcallTests';
import * as cborg from 'cborg';

import { parseEther } from 'ethers/lib/utils';
import { BigNumberish } from 'ethers';

export function fromBigInt(bi: BigNumberish) : Uint8Array {
  return ethers.utils.arrayify(ethers.utils.zeroPad(ethers.utils.hexlify(bi), 16));
}

describe('Subcall', () => {
  let contract: SubcallTests;
  let ownerAddr: string;
  let ownerNativeAddr: Uint8Array;

  before(async () => {
    const factory = await ethers.getContractFactory('SubcallTests');
    contract = (await factory.deploy({value: parseEther('1.0')})) as SubcallTests;

    const [owner] = await ethers.getSigners();
    ownerAddr = await owner.getAddress();

    // Convert Ethereum address to native bytes with version prefix (V1=0x00)
    ownerNativeAddr = ethers.utils.arrayify(ethers.utils.zeroPad(ownerAddr, 21));
    expect(ownerNativeAddr.length).eq(21);
  });

  it('accounts.Transfer', async () => {
    expect(await contract.provider.getBalance(contract.address)).eq(parseEther('1'));

    // transfer balance-1 back to owner, then wait for transaction to be mined
    const balance = await contract.provider.getBalance(contract.address);
    const message = cborg.encode({
      to: ownerNativeAddr,
      amount: [fromBigInt(balance.sub(1)), new Uint8Array()]
    });
    let tx = await contract.testSubcall('accounts.Transfer', message);
    let receipt = await tx.wait();

    // Transfer is success with: status=0, data=null
    const event = receipt.events![0].args! as unknown as {status:number, data:string};
    expect(event.status).eq(0);
    expect(cborg.decode(ethers.utils.arrayify(event.data))).is.null;

    // Ensure contract only has 1 wei left
    expect(await contract.provider.getBalance(contract.address)).eq(1);

    // Transfer using the Subcall.accounts_Transfer method
    tx = await contract.testAccountsTransfer(ownerAddr, 1);
    receipt = await tx.wait();

    // Ensure contract only no wei left
    expect(await contract.provider.getBalance(contract.address)).eq(0);
  });
});
