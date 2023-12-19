// SPDX-License-Identifier: Apache-2.0

import { ethers } from 'hardhat';
import { expect } from 'chai';
import { SemanticTests } from '../typechain-types/contracts/tests/SemanticTests';
import { SemanticTests__factory } from '../typechain-types/factories/contracts/tests';

const ERROR_NUM =
  '0x1023456789abcdef1023456789abcdef1023456789abcdef1023456789abcdef';

describe('EVM Semantics', () => {
  let c: SemanticTests;
  let chainId: number;

  before(async () => {
    const f = (await ethers.getContractFactory(
      'SemanticTests',
    )) as SemanticTests__factory;
    c = await f.deploy();
    await c.waitForDeployment();
    chainId = (await ethers.provider.getNetwork()).chainId;
  });

  it('eth_call maximum return length vs gas limit', async () => {
    const i = 1211104;
    const respHex = await c.testViewLength(i);
    const respBytes = ethers.getBytes(respHex);
    expect(respBytes.length).eq(i);
    await expect(c.testViewLength(i + 1)).reverted;
  });

  it('Error string in view call', async () => {
    try {
      await c.testViewRevert();
    } catch (x: any) {
      expect(x.revert.args[0]).to.eq('ThisIsAnError');
      expect(x.revert.name).to.eq('Error');
    }
  });

  it('Custom revert in view call', async () => {
    // Perform view call, which is expected to revert
    try {
      await c.testCustomViewRevert();
      expect(false).to.be.true;
    } catch (x: any) {
      expect(x.revert.args[0]).to.eq(ERROR_NUM);
      expect(x.revert.name).to.eq('CustomError');
    }
  });
});
