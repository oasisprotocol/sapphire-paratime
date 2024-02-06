// SPDX-License-Identifier: Apache-2.0

import { expect } from 'chai';
import { ethers } from 'hardhat';
import { GasTests } from '../typechain-types/contracts/tests/Gas.sol/GasTests';

describe('Gas Padding', function () {
  let contract: GasTests;

  before(async () => {
    const factory = await ethers.getContractFactory('GasTests');
    contract = (await factory.deploy()) as unknown as GasTests;
  });

  it('Gas Padding works as Expected', async () => {
    let tx = await contract.testConstantTime(1, 100000);
    let receipt = await tx.wait();
    const initialGasUsed = receipt!.cumulativeGasUsed;

    tx = await contract.testConstantTime(2, 100000);
    receipt = await tx.wait();
    expect(receipt!.cumulativeGasUsed).eq(initialGasUsed);

    tx = await contract.testConstantTime(1, 110000);
    receipt = await tx.wait();
    expect(receipt!.cumulativeGasUsed).eq(initialGasUsed + 10000n);

    // Note: calldata isn't included in gas padding
    // Thus when the value is 0 it will use 4 gas instead of 16 gas
    tx = await contract.testConstantTime(0, 100000);
    receipt = await tx.wait();
    expect(receipt?.cumulativeGasUsed).eq(initialGasUsed - 12n);
  });
});
