// tslint:disable-next-line no-implicit-dependencies
import { assert, expect } from 'chai';
import { useEnvironment } from './helpers';
import { time, loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import * as sapphire from '@oasisprotocol/sapphire-paratime';

describe('Hardhat Runtime Environment Oasis Extension', function () {
  useEnvironment('hardhat-project');

  it('Should handle get public key request', async function () {
    const result = await this.hre.network.provider.send(
      'oasis_callDataPublicKey',
      [],
    );
    assert.isNotNull(result.key);
  });

  it('Should return zero for getStorageAt request', async function () {
    const [owner] = await this.hre.ethers.getSigners();
    let signer = sapphire.wrap(owner);
    const Lock = await this.hre.ethers.getContractFactory('Lock', signer);
    const unlockTime = (await time.latest()) + 60;
    const lock = await Lock.deploy(unlockTime, { value: 1_000 });
    const result = await this.hre.network.provider.send('eth_getStorageAt', [
      lock.address,
      '0x0',
      'latest',
    ]);
    expect(result).to.equal(`0x${'0'.repeat(64)}`);
  });

  it('Should deploy to hardhat local node and query for sapphire', async function () {
    const [owner] = await this.hre.ethers.getSigners();
    let signer = sapphire.wrap(owner);
    const Lock = await this.hre.ethers.getContractFactory('Lock', signer);
    const unlockTime = (await time.latest()) + 60;
    const lock = await Lock.deploy(unlockTime, { value: 1_000 });
    expect(await lock.owner()).to.equal(owner.address);

    // do the signed query
    const result = await lock.unlockTime();
    expect(result).to.equal(unlockTime);
  });

  it('Should not deploy to hardhat for non-sapphire', async function () {
    const Lock = await this.hre.ethers.getContractFactory('Lock');
    const unlockTime = (await time.latest()) + 60;
    await expect(Lock.deploy(unlockTime, { value: 1_000 })).to.be.rejectedWith(
      'CBOR decode error',
    );
  });
});
