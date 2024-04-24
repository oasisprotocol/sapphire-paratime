// SPDX-License-Identifier: Apache-2.0

import { ethers } from 'hardhat';
import { expect } from 'chai';
import { SemanticTests } from '../typechain-types/contracts/tests/SemanticTests';
import { getBytes } from 'ethers';

const ERROR_NUM =
  0x1023456789abcdef1023456789abcdef1023456789abcdef1023456789abcdefn;

describe('EVM Semantics', () => {
  let c: SemanticTests;
  let chainId: bigint;

  before(async () => {
    const f = await ethers.getContractFactory('SemanticTests');
    c = (await f.deploy()) as unknown as SemanticTests;
    await c.waitForDeployment();
    chainId = (await ethers.provider.getNetwork()).chainId;
  });

  it('eth_call maximum return length vs gas limit', async function () {
    // Skip this test on non-sapphire chains
    // It tests exact gas semantics of Sapphire with calldata limits
    if (chainId == 31337n) {
      this.skip();
    }
    const i = 1211104;
    const respHex = await c.testViewLength(i);
    const respBytes = getBytes(respHex);
    expect(respBytes.length).eq(i);

    let caught = false;
    try {
      await c.testViewLength(i + 1);
    } catch (e: unknown) {
      caught = true;
      expect((e as Error).message).contains('out of gas');
    }
    expect(caught).eq(true);
  });

  it('Error string in view call', async () => {
    await expect(c.testViewRevert()).to.be.revertedWith('ThisIsAnError');
  });

  it('Custom revert in view call', async () => {
    await expect(c.testCustomViewRevert())
      .to.be.revertedWithCustomError(c, 'CustomError')
      .withArgs(ERROR_NUM);
  });
});
