import { expect } from 'chai';
import { ethers } from 'hardhat';
import { randomBytes } from 'crypto';
import { AEAD, NonceSize } from '@oasisprotocol/deoxysii';

describe('Nonce slicing behavior', function () {
  it('fails to decrypt if the full 32-byte nonce is used instead of the first 15 bytes', async function () {
    const net = await ethers.provider.getNetwork();
    const sapphireChainIds = new Set([0x5afe, 0x5aff, 0x5afd].map(BigInt));
    if (!sapphireChainIds.has(net.chainId)) {
      // Skip on non‑Sapphire networks where precompiles are unavailable.
      // eslint-disable-next-line no-restricted-syntax
      (this as any).skip?.();
    }

    const Contract = await ethers.getContractFactory('EncryptedEvents');
    const contract = await Contract.deploy();
    await contract.waitForDeployment();

    const keyBytes = randomBytes(32);
    const keyHex = ethers.hexlify(keyBytes) as `0x${string}`;
    const message = 'Slice your nonce!';

    const tx = await contract.emitEncrypted(
      keyHex,
      ethers.hexlify(ethers.toUtf8Bytes(message)),
    );
    const receipt = await tx.wait();

    const parsed = receipt!.logs
      .map((l) => contract.interface.parseLog(l))
      .find((l) => l && l.name === 'Encrypted');
    if (!parsed) throw new Error('Encrypted event not found');

    const nonceFull: string = parsed.args[1];
    const ciphertext: string = parsed.args[2];

    const aead = new AEAD(keyBytes);

    // Using the correct 15-byte slice should work as a sanity check
    const ok = aead.decrypt(
      ethers.getBytes(nonceFull).slice(0, NonceSize),
      ethers.getBytes(ciphertext),
      new Uint8Array(),
    );
    expect(new TextDecoder().decode(ok)).to.equal(message);

    // Using the full 32-byte nonce must fail
    expect(() =>
      aead.decrypt(
        ethers.getBytes(nonceFull), // <-- no slice (WRONG)
        ethers.getBytes(ciphertext),
        new Uint8Array(),
      ),
    ).to.throw();
  });
});
