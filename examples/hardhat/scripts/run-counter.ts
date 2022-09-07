// Usage: pnpm hardhat run --network <network> scripts/deploy-bridge-adapter-v1.ts

import { ethers } from 'hardhat';
import * as sapphire from '@oasisprotocol/sapphire-paratime';

async function main() {
  const signer0 = (await ethers.getSigners())[0];
  const chainId = await signer0.getChainId();
  const signer = chainId in sapphire.NETWORKS ? sapphire.wrap(signer0) : signer0;
  const Counter = await ethers.getContractFactory('Counter', signer);
  const counter = await Counter.deploy().then((c) => c.deployed());
  console.log('Counter deployed to:', counter.address, 'in', counter.deployTransaction.hash);
  const code = await signer.provider!.getCode(counter.address);
  if (code == '0x') throw new Error('deploy failed');
  for (let i = 0; i < 3; i++) {
    const tx = await counter.increment();
    console.log('Incremented counter in', tx.hash);
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error('increment failed');
    console.log('The counter value is', (await counter.callStatic.count()).toNumber());
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
