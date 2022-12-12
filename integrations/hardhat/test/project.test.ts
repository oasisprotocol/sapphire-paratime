// tslint:disable-next-line no-implicit-dependencies
import { assert, expect } from 'chai';
import { useEnvironment } from './helpers';
import { time, loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import * as sapphire from '@oasisprotocol/sapphire-paratime';

describe('Integration tests', function () {
  describe('Hardhat Runtime Environment Oasis Extension', function () {
    useEnvironment('hardhat-project');

    it('Should handle get public key request', async function () {
      const result = await this.hre.network.provider.send(
        'oasis_callDataPublicKey',
        [],
      );
      assert.isNotNull(result.key);
    });

    it('Should deploy to hardhat local node for sapphire', async function () {
      await this.hre.run('compile', { quiet: true });
      const [owner] = await this.hre.ethers.getSigners();
      let signer = sapphire.wrap(owner);
      const Lock = await this.hre.ethers.getContractFactory('Lock', signer);
      const unlockTime = (await time.latest()) + 60;
      const lock = await Lock.deploy(unlockTime, { value: 1_000 });
      expect(await lock.owner()).to.equal(owner.address);
    });

    it('Should not deploy to hardhat for non-sapphire', async function () {
      await this.hre.run('compile', { quiet: true });
      const Lock = await this.hre.ethers.getContractFactory('Lock');
      const unlockTime = (await time.latest()) + 60;
      await expect(Lock.deploy(unlockTime, { value: 1_000 })).to.be.rejected;
    });
  });
});
