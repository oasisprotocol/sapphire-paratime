import { expect } from 'chai';
import { ethers } from 'hardhat';
import { randomBytes } from 'crypto';
import { AEAD, NonceSize } from '@oasisprotocol/deoxysii';

describe('EncryptedEvents', function () {
  it('decrypts emitted ciphertext back to the original plaintext', async function () {
    const net = await ethers.provider.getNetwork();
    const sapphireChainIds = new Set([0x5afe, 0x5aff, 0x5afd].map(BigInt));
    if (!sapphireChainIds.has(net.chainId)) {
      // Sapphire precompiles are not available on non-Sapphire networks (e.g., Hardhat local).
      // Skip this test in that case.
      // eslint-disable-next-line no-restricted-syntax
      (this as any).skip?.();
    }
    const Contract = await ethers.getContractFactory('EncryptedEvents');
    const contract = await Contract.deploy();
    await contract.waitForDeployment();

    const keyBytes = randomBytes(32);
    const keyHex = ethers.hexlify(keyBytes) as `0x${string}`;
    const message = 'Hello Sapphire';

    const tx = await contract.emitEncrypted(
      keyHex,
      ethers.hexlify(ethers.toUtf8Bytes(message)),
    );
    const receipt = await tx.wait();

    const parsed = receipt!.logs
      .map((l) => contract.interface.parseLog(l))
      .find((l) => l && l.name === 'Encrypted');
    if (!parsed) throw new Error('Encrypted event not found');

    // Encrypted(address sender, bytes32 nonce, bytes ciphertext)
    const nonce: string = parsed.args[1];
    const ciphertext: string = parsed.args[2];

    const aead = new AEAD(keyBytes);
    const plaintext = aead.decrypt(
      ethers.getBytes(nonce).slice(0, NonceSize),
      ethers.getBytes(ciphertext),
      new Uint8Array(),
    );

    expect(new TextDecoder().decode(plaintext)).to.equal(message);
  });
});
