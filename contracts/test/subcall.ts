import { ethers } from 'hardhat';
import { expect } from 'chai';
import { SubcallTests } from '../typechain-types/contracts/tests/SubcallTests';
import * as cborg from 'cborg';

import { Decoded, bech32 } from 'bech32';

describe('Subcall', () => {
  let contract: SubcallTests;
  let alice: Decoded;
  before(async () => {
    alice = bech32.decode('oasis1qrec770vrek0a9a5lcrv0zvt22504k68svq7kzve');
    const factory = await ethers.getContractFactory('SubcallTests');
    contract = (await factory.deploy()) as SubcallTests;
  });
  it('account.Transfer', async () => {
    const addr = new Uint8Array(21);
    const transfer = cborg.encode({
      to: new Uint8Array(alice.words.slice(1)),
      amount: 0n,
    });
    const tx = await contract.testSubcall('account.Transfer', transfer);
    const receipt = await tx.wait();
    const event = receipt.events![0].args!;
    expect(event.status).eq(3);
    expect(event.data).eq('0x636f7265');
  });
});
