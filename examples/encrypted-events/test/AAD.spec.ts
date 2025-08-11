import { expect } from 'chai';
import { ethers } from 'hardhat';
import { AEAD, NonceSize } from '@oasisprotocol/deoxysii';
import { randomBytes } from 'crypto';
import { x25519 } from '@noble/curves/ed25519';
import { mraeDeoxysii } from '@oasisprotocol/client-rt';

describe('AAD behavior', function () {
  before(async function () {
    const net = await ethers.provider.getNetwork();
    const sapphire = new Set([0x5afe, 0x5aff, 0x5afd].map(BigInt));
    if (!sapphire.has(net.chainId)) {
      // Sapphire precompiles are not available on non‑Sapphire networks.
      // eslint-disable-next-line no-restricted-syntax
      (this as any).skip?.();
    }
  });

  it('EncryptedEvents: decrypt fails without AAD and succeeds with correct AAD', async function () {
    const Contract = await ethers.getContractFactory('EncryptedEvents');
    const contract = await Contract.deploy();
    await contract.waitForDeployment();

    const keyBytes = randomBytes(32);
    const keyHex = ethers.hexlify(keyBytes) as `0x${string}`;
    const message = 'AAD bound message';

    // Call AAD variant
    const tx = await contract.emitEncryptedWithAad(
      keyHex,
      ethers.hexlify(ethers.toUtf8Bytes(message)),
    );
    const receipt = await tx.wait();

    const parsed = receipt!.logs
      .map((l: any) => contract.interface.parseLog(l))
      .find((l: any) => l && l.name === 'Encrypted');
    if (!parsed) throw new Error('Encrypted event not found');

    const sender: string = parsed.args[0];
    const nonce: string = parsed.args[1];
    const ciphertext: string = parsed.args[2];

    const aead = new AEAD(keyBytes);

    // Wrong/no AAD should throw
    expect(() =>
      aead.decrypt(
        ethers.getBytes(nonce).slice(0, NonceSize),
        ethers.getBytes(ciphertext),
        new Uint8Array(),
      ),
    ).to.throw();

    // Correct AAD (20-byte address equal to emitted sender)
    const aadBytes = ethers.getBytes(sender);

    const plaintext = aead.decrypt(
      ethers.getBytes(nonce).slice(0, NonceSize),
      ethers.getBytes(ciphertext),
      aadBytes,
    );
    expect(new TextDecoder().decode(plaintext)).to.equal(message);
  });

  it('EncryptedEventsECDH: decrypt fails without AAD and succeeds with correct AAD', async function () {
    const Contract = await ethers.getContractFactory('EncryptedEventsECDH');
    const contract = await Contract.deploy();
    await contract.waitForDeployment();

    // Caller keypair (off-chain)
    const callerSk = ethers.randomBytes(32);
    const callerPk = x25519.getPublicKey(callerSk);
    const callerPkHex = ethers.hexlify(callerPk) as `0x${string}`;

    const message = 'AAD bound ECDH message';

    // Emit using AAD variant
    const tx = await contract.emitEncryptedECDHWithAad(
      callerPkHex,
      ethers.hexlify(ethers.toUtf8Bytes(message)) as `0x${string}`,
    );
    const receipt = await tx.wait();

    // Fetch contract's public key and derive symmetric key off-chain via client SDK
    const contractPkHex: string = await contract.contractPk();
    const key = mraeDeoxysii.deriveSymmetricKey(
      ethers.getBytes(contractPkHex),
      callerSk,
    );

    // Parse log
    const parsed = receipt!.logs
      .map((l: any) => contract.interface.parseLog(l))
      .find((l: any) => l && l.name === 'Encrypted');
    if (!parsed) throw new Error('Encrypted event not found');

    const sender: string = parsed.args[0];
    const nonce: string = parsed.args[1];
    const ciphertext: string = parsed.args[2];

    const aead = new AEAD(key);

    // Wrong/no AAD should throw
    expect(() =>
      aead.decrypt(
        ethers.getBytes(nonce).slice(0, NonceSize),
        ethers.getBytes(ciphertext),
        new Uint8Array(),
      ),
    ).to.throw();

    // Correct AAD (emitted sender)
    const aadBytes = ethers.getBytes(sender);

    const plaintext = aead.decrypt(
      ethers.getBytes(nonce).slice(0, NonceSize),
      ethers.getBytes(ciphertext),
      aadBytes,
    );
    expect(new TextDecoder().decode(plaintext)).to.equal(message);
  });
});
