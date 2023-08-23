import { expect } from "chai";
import { randomBytes, createHash } from 'crypto';
import { ethers } from 'hardhat';
import { HashTests } from '../typechain-types/contracts/tests/HashTests';
import { HashTests__factory } from "../typechain-types/factories/contracts/tests";

describe('Hashes', () => {
    let contract : HashTests;

    before(async () => {
        const factory = await ethers.getContractFactory('HashTests') as HashTests__factory;
        contract = await factory.deploy();
        await contract.deployed();
    });

    it('SHA512/256', async () => {
        for( let i = 0; i < 512; i += 64 ) {
            const data = randomBytes(i);
            const hash = createHash('SHA512-256').update(data).digest('hex');
            const result = await contract.testSHA512_256(data);
            expect(result).eq('0x' + hash);
        }
    });

    it('SHA512', async () => {
        for( let i = 0; i < 512; i += 64 ) {
            const data = randomBytes(i);
            const hash = createHash('SHA512').update(data).digest('hex');
            const result = await contract.testSHA512(data);
            expect(result).eq('0x' + hash);
        }
    });
});
