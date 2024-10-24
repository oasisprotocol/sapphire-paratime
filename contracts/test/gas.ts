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
    // TODO: Workaround for flaky gas used https://github.com/oasisprotocol/sapphire-paratime/issues/337.
    expect(receipt!.cumulativeGasUsed)
      .gte(initialGasUsed - 1n)
      .lte(initialGasUsed);

    tx = await contract.testConstantTime(1, 110000);
    receipt = await tx.wait();
    // TODO: Workaround for flaky gas used https://github.com/oasisprotocol/sapphire-paratime/issues/337.
    expect(receipt!.cumulativeGasUsed)
      .gte(initialGasUsed + 10000n)
      .lte(initialGasUsed + 10001n);

    // Note: calldata isn't included in gas padding
    // Thus when the value is 0 it will use 4 gas instead of 16 gas
    // TODO: Workaround for flaky gas used https://github.com/oasisprotocol/sapphire-paratime/issues/337.
    tx = await contract.testConstantTime(0, 100000);
    receipt = await tx.wait();
    expect(receipt?.cumulativeGasUsed)
      .gte(initialGasUsed - 13n)
      .lte(initialGasUsed - 12n);
  });
});
