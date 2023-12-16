// Usage: pnpm hardhat run --network <network> scripts/run-vigil.ts

import { ethers } from 'hardhat';

async function main() {
  const Vigil = await ethers.getContractFactory('Vigil');
  const vigil = await Vigil.deploy();
  console.log('Vigil deployed to:', await vigil.getAddress());

  const tx = await vigil.createSecret(
    'ingredient',
    30 /* seconds */,
    Buffer.from('brussels sprouts'),
  );
  console.log('Storing a secret in', tx.hash);
  await tx.wait();
  try {
    console.log('Checking the secret');
    await vigil.connect(ethers.provider).staticCall.revealSecret(0);
    console.log('Uh oh. The secret was available!');
    process.exit(1);
  } catch (e: any) {
    console.log('failed to fetch secret:', e.message);
  }
  console.log('Waiting...');

  // Manually generate some transactions to increment local Docker
  // container block
  if ((await ethers.provider.getNetwork()).name == 'sapphire_localnet') {
    await generateTraffic(10);
  }

  await new Promise((resolve) => setTimeout(resolve, 30_000));
  console.log('Checking the secret again');
  await (await vigil.revealSecret(0)).wait(); // Reveal the secret.
  const secret = await vigil.revealSecret.staticCallResult(0); // Get the value.
  console.log('The secret ingredient is', Buffer.from(secret[0].slice(2), 'hex').toString());
}

async function generateTraffic(n: number) {
  const signer = await ethers.provider.getSigner();
  for (let i = 0; i < n; i++) {
    await signer.sendTransaction({
      to: "0x000000000000000000000000000000000000dEaD",
      value: ethers.parseEther("1.0"),
      data: "0x"
    });
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
