// Usage: pnpm hardhat run --network <network> scripts/deploy-arcanum.ts

import { ethers } from 'hardhat';

async function main() {
  const Arcanum = await ethers.getContractFactory('Arcanum');
  const arcanum = await Arcanum.deploy();
  console.log('Arcanum deployed to:', arcanum.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
