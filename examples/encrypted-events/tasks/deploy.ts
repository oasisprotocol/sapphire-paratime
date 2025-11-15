import { task } from 'hardhat/config';

task('deploy', 'Deploys the EncryptedEvents contract').setAction(
  async (_args, hre) => {
    const { ethers } = hre;
    const Contract = await ethers.getContractFactory('EncryptedEvents');
    const contract = await Contract.deploy();
    await contract.waitForDeployment();
    console.log('EncryptedEvents deployed to:', contract.target);
  },
);
