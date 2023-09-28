// SPDX-License-Identifier: Apache-2.0

import { ethers } from 'hardhat';
import { expect } from 'chai';
import { SemanticTests } from '../typechain-types/contracts/tests/SemanticTests';
import { SemanticTests__factory } from '../typechain-types/factories/contracts/tests';

describe('EVM Semantics', () => {
    let c: SemanticTests;
    before(async () => {
        const f = await ethers.getContractFactory('SemanticTests') as SemanticTests__factory;
        c = await f.deploy();
        await c.deployed();
    });
    it('eth_call maximum return length vs gas limit', async () => {
        const i = 1787872;
        const respHex = await c.testViewLength(i);
        const respBytes = ethers.utils.arrayify(respHex);
        expect(respBytes.length).eq(i);
        expect(c.testViewLength(i+1)).reverted;
    })
});