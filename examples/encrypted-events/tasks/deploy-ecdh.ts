import { task } from 'hardhat/config';

task(
  'deploy-ecdh',
  'Deploys the EncryptedEventsECDH contract and prints its Curve25519 public key',
).setAction(async (_args, hre) => {
  const { ethers } = hre;
  const Contract = await ethers.getContractFactory('EncryptedEventsECDH');
  const contract = await Contract.deploy();
  await contract.waitForDeployment();

  const addr = contract.target;
  const pk: string = await contract.contractPk();

  console.log('EncryptedEventsECDH deployed to:', addr);
  console.log('Contract Curve25519 public key (hex):', pk);
});
