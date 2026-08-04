import { ethers } from 'hardhat';
import { expect } from 'chai';
import { ZeroAddress, ZeroHash } from 'ethers';
import { UPUPSUpgradeableTests } from '../typechain-types/contracts/tests/UPUPSUpgradeableTests';

async function waitForBlockNumber(target: number) {
  let current = await ethers.provider.getBlockNumber();
  while (current < target) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    current = await ethers.provider.getBlockNumber();
  }
}

async function codeHashOf(address: string) {
  return ethers.keccak256(await ethers.provider.getCode(address));
}

describe('UPUPSUpgradeable', function () {
  async function deployImplementation(name: string) {
    const factory = await ethers.getContractFactory(name);
    const impl = await factory.deploy();
    await impl.waitForDeployment();
    return impl;
  }

  async function deploy() {
    const [owner, other] = await ethers.getSigners();
    const implFactory = await ethers.getContractFactory(
      'UPUPSUpgradeableTests',
    );
    const impl = await deployImplementation('UPUPSUpgradeableTests');

    const initData = implFactory.interface.encodeFunctionData('initialize', [
      owner.address,
    ]);
    const proxyFactory = await ethers.getContractFactory('ERC1967Proxy');
    const proxy = await proxyFactory.deploy(await impl.getAddress(), initData);
    await proxy.waitForDeployment();

    const contract = implFactory.attach(
      await proxy.getAddress(),
    ) as unknown as UPUPSUpgradeableTests;

    return { contract, owner, other, implAddress: await impl.getAddress() };
  }

  // Proposes the upgrade and returns the minBlockNumber actually recorded
  // on-chain.
  async function proposeUpgrade(
    contract: UPUPSUpgradeableTests,
    newImplementation: string,
    minBlockNumber: number,
  ) {
    await (
      await contract.proposeUpgrade(newImplementation, minBlockNumber)
    ).wait();
    return Number(await contract.proposedUpgradeMinBlockNumber());
  }

  describe('successful upgrade', function () {
    it('Should have no pending proposal right after deployment', async () => {
      const { contract } = await deploy();
      expect(await contract.proposedUpgradeImplementation()).eq(ZeroAddress);
      expect(await contract.proposedUpgradeMinBlockNumber()).eq(0);
      expect(await contract.version()).eq(1);
    });

    it('Should upgrade once the default (next-block) proposal matures', async () => {
      const { contract, owner } = await deploy();
      const v2 = await deployImplementation('UPUPSUpgradeableTestsV2');
      const v2Address = await v2.getAddress();
      const v2CodeHash = await codeHashOf(v2Address);

      const minBlockNumber = await proposeUpgrade(contract, v2Address, 0);

      expect(await contract.proposedUpgradeImplementation()).eq(v2Address);
      expect(await contract.proposedUpgradeImplementationHash()).eq(v2CodeHash);

      await waitForBlockNumber(minBlockNumber);

      await expect(contract.connect(owner).upgradeToAndCall(v2Address, '0x'))
        .to.emit(contract, 'UpgradeAccepted')
        .withArgs(v2Address, v2CodeHash, minBlockNumber);

      expect(await contract.version()).eq(2);
      expect(await contract.proposedUpgradeImplementation()).eq(ZeroAddress);
      expect(await contract.proposedUpgradeMinBlockNumber()).eq(0);
      expect(await contract.proposedUpgradeImplementationHash()).eq(ZeroHash);
    });

    it('Should upgrade once an explicit future minBlockNumber matures', async () => {
      const { contract, owner } = await deploy();
      const v2 = await deployImplementation('UPUPSUpgradeableTestsV2');
      const v2Address = await v2.getAddress();

      const currentBlock = await ethers.provider.getBlockNumber();
      const minBlockNumber = currentBlock + 3;

      await expect(contract.proposeUpgrade(v2Address, minBlockNumber))
        .to.emit(contract, 'UpgradeProposed')
        .withArgs(v2Address, await codeHashOf(v2Address), minBlockNumber);

      await waitForBlockNumber(minBlockNumber);

      await contract.connect(owner).upgradeToAndCall(v2Address, '0x');
      expect(await contract.version()).eq(2);
    });
  });

  describe('negative cases', function () {
    it('proposeUpgrade should revert when called by a non-owner', async () => {
      const { contract, other } = await deploy();
      const v2 = await deployImplementation('UPUPSUpgradeableTestsV2');

      await expect(
        contract.connect(other).proposeUpgrade(await v2.getAddress(), 0),
      ).to.be.reverted;
      expect(await contract.proposedUpgradeImplementation()).eq(ZeroAddress);
    });

    it('proposeUpgrade should revert when the new implementation has no code', async () => {
      const { contract, other } = await deploy();

      await expect(contract.proposeUpgrade(other.address, 0)).to.be.reverted;
      expect(await contract.proposedUpgradeImplementation()).eq(ZeroAddress);
    });

    it('proposeUpgrade should revert when minBlockNumber is in the past', async () => {
      const { contract } = await deploy();
      const v2 = await deployImplementation('UPUPSUpgradeableTestsV2');
      const pastBlock = await ethers.provider.getBlockNumber();

      await expect(contract.proposeUpgrade(await v2.getAddress(), pastBlock)).to
        .be.reverted;
      expect(await contract.proposedUpgradeImplementation()).eq(ZeroAddress);
    });

    it('upgradeToAndCall should revert when no upgrade has been proposed', async () => {
      const { contract, owner } = await deploy();
      const v2 = await deployImplementation('UPUPSUpgradeableTestsV2');

      await expect(
        contract.connect(owner).upgradeToAndCall(await v2.getAddress(), '0x'),
      ).to.be.reverted;
      expect(await contract.version()).eq(1);
    });

    it('upgradeToAndCall should revert when called with an implementation other than the proposed one', async () => {
      const { contract, owner, implAddress } = await deploy();
      const v2 = await deployImplementation('UPUPSUpgradeableTestsV2');

      await proposeUpgrade(contract, await v2.getAddress(), 0);

      // implAddress was never proposed - only v2 was.
      await expect(contract.connect(owner).upgradeToAndCall(implAddress, '0x'))
        .to.be.reverted;
      expect(await contract.version()).eq(1);
    });

    it('upgradeToAndCall should revert before the proposal minBlockNumber is reached', async () => {
      const { contract, owner } = await deploy();
      const v2 = await deployImplementation('UPUPSUpgradeableTestsV2');
      const v2Address = await v2.getAddress();

      const currentBlock = await ethers.provider.getBlockNumber();
      await contract.proposeUpgrade(v2Address, currentBlock + 5);

      await expect(contract.connect(owner).upgradeToAndCall(v2Address, '0x')).to
        .be.reverted;
      expect(await contract.version()).eq(1);
    });

    it('upgradeToAndCall should revert when called by a non-owner, even with a matured proposal', async () => {
      const { contract, other } = await deploy();
      const v2 = await deployImplementation('UPUPSUpgradeableTestsV2');
      const v2Address = await v2.getAddress();

      const minBlockNumber = await proposeUpgrade(contract, v2Address, 0);
      await waitForBlockNumber(minBlockNumber);

      await expect(contract.connect(other).upgradeToAndCall(v2Address, '0x')).to
        .be.reverted;
      expect(await contract.version()).eq(1);
    });

    it('upgradeToAndCall should revert if replayed after the proposal has already been consumed', async () => {
      const { contract, owner } = await deploy();
      const v2 = await deployImplementation('UPUPSUpgradeableTestsV2');
      const v2Address = await v2.getAddress();

      const minBlockNumber = await proposeUpgrade(contract, v2Address, 0);
      await waitForBlockNumber(minBlockNumber);
      await contract.connect(owner).upgradeToAndCall(v2Address, '0x');

      await expect(contract.connect(owner).upgradeToAndCall(v2Address, '0x')).to
        .be.reverted;
      expect(await contract.version()).eq(2);
    });
  });
});
