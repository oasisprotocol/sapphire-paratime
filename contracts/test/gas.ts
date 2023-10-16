// SPDX-License-Identifier: Apache-2.0

import { expect } from 'chai';
import { ethers } from 'hardhat';
import { GasTests__factory } from '../typechain-types/factories/contracts/tests/Gas.sol';
import { GasTests } from '../typechain-types/contracts/tests/Gas.sol/GasTests';

describe('Gas Padding', function () {
  let contract: GasTests;

  before(async () => {
    const factory = (await ethers.getContractFactory(
      'GasTests',
    )) as GasTests__factory;
    contract = await factory.deploy();
  });

  it('Gas Padding works as Expected', async () => {
    const expectedGas = 122735;

    let tx = await contract.testConstantTime(1, 100000);
    let receipt = await tx.wait();
    expect(receipt.cumulativeGasUsed).eq(expectedGas);

    tx = await contract.testConstantTime(2, 100000);
    receipt = await tx.wait();
    expect(receipt.cumulativeGasUsed).eq(expectedGas);

    tx = await contract.testConstantTime(1, 100000);
    receipt = await tx.wait();
    expect(receipt.cumulativeGasUsed).eq(expectedGas);

    // Note: calldata isn't included in gas padding
    // Thus when the value is 0 it will use 4 gas instead of 16 gas
    tx = await contract.testConstantTime(0, 100000);
    receipt = await tx.wait();
    expect(receipt.cumulativeGasUsed).eq(expectedGas - 12);
  });
});
