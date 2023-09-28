// SPDX-License-Identifier: Apache-2.0

import { ethers } from 'hardhat';
import { expect } from 'chai';
import { SemanticTests } from '../typechain-types/contracts/tests/SemanticTests';
import { SemanticTests__factory } from '../typechain-types/factories/contracts/tests';

const ERROR_NUM = '0x1023456789abcdef1023456789abcdef1023456789abcdef1023456789abcdef';

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
    });

    // Apparently `expect().to.be.revertedWithCustomError` doesn't work sometimes
    // Otherwise we could do this:
    //expect(c.testCustomRevert()).to.be.revertedWithCustomError(c, 'CustomError').withArgs(errorNum);
    //expect(c.testCustomViewRevert()).to.be.revertedWithCustomError(c, 'CustomError').withArgs(errorNum);

    it('Custom revert in view call', async () => {
        // Perform view call, which is expected to revert
        try {
            await c.testCustomViewRevert();
            expect(false).to.be.true;
        }
        catch( x: any ) {
            expect(x.errorArgs[0]).to.eq(ERROR_NUM);
            expect(x.errorName).to.eq('CustomError');
        }
    });

    it('Custom error in tx', async () => {
        // Perform transaction which is expected to revert
        try {
            const tx = await c.testCustomRevert();
            console.log('txhash', tx.hash);
            await tx.wait();
            expect(false).to.be.true;
        }
        catch( x: any ) {
            expect(x.data).eq('0x110b3655' + ERROR_NUM.slice(2));
        }
    });
});
