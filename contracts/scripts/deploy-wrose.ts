// Usage: pnpm hardhat run --network <network> scripts/deploy-wrose.ts

import { ethers } from 'hardhat';

async function main() {
  const WrappedROSE = await ethers.getContractFactory('WrappedROSE');
  const wrose = await WrappedROSE.deploy();
  console.log('wROSE deployed to:', await wrose.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
