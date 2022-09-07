// Usage: pnpm hardhat run --network <network> scripts/run-vigil.ts

import { ethers } from 'hardhat';
import * as sapphire from '@oasisprotocol/sapphire-paratime';

async function main() {
  const signer0 = (await ethers.getSigners())[0];
  const chainId = await signer0.getChainId();
  const signer = chainId in sapphire.NETWORKS ? sapphire.wrap(signer0) : signer0;
  const provider = sapphire.wrap(signer.provider!); // We'll use this to read secrets as an unauthenticated party.

  const Vigil = await ethers.getContractFactory('Vigil', signer);
  const vigil = await Vigil.deploy();
  console.log('Vigil deployed to:', vigil.address);

  const tx = await vigil.createSecret(
    'ingredient',
    30 /* seconds */,
    Buffer.from('brussels sprouts'),
  );
  console.log('Storing a secret in', tx.hash);
  await tx.wait();
  try {
    console.log('Checking the secret');
    await vigil.connect(provider).callStatic.revealSecret(0);
    console.log('Uh oh. The secret was available!');
    process.exit(1);
  } catch (e: any) {
    console.log('failed to fetch secret:', e.message);
  }
  console.log('Waiting...');
  await new Promise((resolve) => setTimeout(resolve, 30_000));
  console.log('Checking the secret again');
  await (await vigil.revealSecret(0)).wait(); // Reveal the secret.
  const secret = await vigil.callStatic.revealSecret(0); // Get the value.
  console.log('The secret ingredient is', Buffer.from(secret.slice(2), 'hex').toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
