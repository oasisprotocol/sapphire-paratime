import { ethers } from 'hardhat';
import { expect } from 'chai';
import { zeroPadValue } from 'ethers';
import { ROFLableTests } from '../typechain-types/contracts/tests/ROFLableTests';
import { ROFLableUpgradeableTests } from '../typechain-types/contracts/tests/ROFLableUpgradeableTests';

const ZERO_APP_ID = zeroPadValue('0x', 21);
const SOME_APP_ID = zeroPadValue(
  '0x1234567890123456789012345678901234567890',
  21,
);

describe('ROFLable', function () {
  async function deploy(appId: string) {
    const factory = await ethers.getContractFactory('ROFLableTests');
    const contract = await factory.deploy(appId);
    await contract.waitForDeployment();
    return contract as unknown as ROFLableTests;
  }

  it('Should report the configured app ID', async () => {
    const contract = await deploy(SOME_APP_ID);
    expect(await contract.roflAppId()).eq(SOME_APP_ID);
  });

  it('onlyROFL should pass when the app ID is 0x0', async () => {
    const contract = await deploy(ZERO_APP_ID);
    await expect(contract.testOnlyROFL()).to.not.be.reverted;
  });

  it('onlyROFL should revert when a non-zero app ID is set (no ROFL instance in tests)', async () => {
    const contract = await deploy(SOME_APP_ID);
    await expect(contract.testOnlyROFL()).to.be.reverted;
  });

  it('Setting a new app ID should update roflAppId() and emit an event', async () => {
    const contract = await deploy(ZERO_APP_ID);
    await expect(contract.setRoflAppId(SOME_APP_ID))
      .to.emit(contract, 'RoflAppIdUpdated')
      .withArgs(ZERO_APP_ID, SOME_APP_ID);
    expect(await contract.roflAppId()).eq(SOME_APP_ID);
  });

  it('setRoflAppId should revert once a non-zero app ID is set (no ROFL instance in tests)', async () => {
    const contract = await deploy(SOME_APP_ID);
    await expect(contract.setRoflAppId(ZERO_APP_ID)).to.be.reverted;
  });
});

describe('ROFLableUpgradeable', function () {
  async function deploy(appId: string) {
    const factory = await ethers.getContractFactory('ROFLableUpgradeableTests');
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    await contract.initialize(appId);
    return contract as unknown as ROFLableUpgradeableTests;
  }

  it('Should report the configured app ID', async () => {
    const contract = await deploy(SOME_APP_ID);
    expect(await contract.roflAppId()).eq(SOME_APP_ID);
  });

  it('onlyROFL should pass when the app ID is 0x0', async () => {
    const contract = await deploy(ZERO_APP_ID);
    await expect(contract.testOnlyROFL()).to.not.be.reverted;
  });

  it('onlyROFL should revert when a non-zero app ID is set (no ROFL instance in tests)', async () => {
    const contract = await deploy(SOME_APP_ID);
    await expect(contract.testOnlyROFL()).to.be.reverted;
  });

  it('Cannot be initialized twice', async () => {
    const contract = await deploy(ZERO_APP_ID);
    await expect(contract.initialize(SOME_APP_ID)).to.be.reverted;
  });

  it('setRoflAppId should revert once a non-zero app ID is set (no ROFL instance in tests)', async () => {
    const contract = await deploy(SOME_APP_ID);
    await expect(contract.setRoflAppId(ZERO_APP_ID)).to.be.reverted;
  });
});
