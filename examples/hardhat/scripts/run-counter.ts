// Usage: pnpm hardhat run --network <network> scripts/run-counter.ts

import { ethers } from 'hardhat';

async function main() {
  const Counter = await ethers.getContractFactory('Counter');
  const counter = await Counter.deploy().then((c) => c.waitForDeployment());
  const tx = counter.deploymentTransaction();
  console.log('Counter deployed to:', await counter.getAddress(), 'in', tx?.hash);
  const provider = Counter.runner!.provider!;
  const code = await provider.getCode(await counter.getAddress());
  if (code == '0x') throw new Error('deploy failed');
  for (let i = 0; i < 3; i++) {
    const tx = await counter.increment();
    console.log('Incremented counter in', tx.hash);
    const receipt = await tx.wait();
    if (receipt!.status !== 1) throw new Error('increment failed');
    console.log('The counter value is', await counter.count());
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
