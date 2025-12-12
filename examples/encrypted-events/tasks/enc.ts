import { task } from 'hardhat/config';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { AEAD, NonceSize } from '@oasisprotocol/deoxysii';
import { x25519 } from '@noble/curves/ed25519';
import { mraeDeoxysii } from '@oasisprotocol/client-rt';
import { hkdfSync } from 'crypto';

/**
 * Event signature (both contracts):
 *   event Encrypted(address indexed sender, bytes32 nonce, bytes ciphertext);
 *
 * Tasks:
 *   EMIT (key):     npx hardhat emit --network <net> --mode key  --contract <ADDR> [--message "..."] [--key <HEX32>] [--aadmode none|sender|context]
 *   EMIT (ecdh):    npx hardhat emit --network <net> --mode ecdh --contract <ADDR> [--message "..."] [--secret <HEX32>] [--aadmode none|sender|context]
 *
 *   LISTEN (key):   npx hardhat listen --network <net> --mode key  --contract <ADDR> --key <HEX32> [--aadmode none|sender|context]
 *   LISTEN (ecdh):  npx hardhat listen --network <net> --mode ecdh --contract <ADDR> --secret <HEX32> [--aadmode none|sender|context] [--hkdf]
 *
 *   DECRYPT (key):  npx hardhat decrypt --network <net> --mode key  [--contract <ADDR>] --tx <TX_HASH> --key <HEX32> [--aadmode none|sender|context]
 *   DECRYPT (ecdh): npx hardhat decrypt --network <net> --mode ecdh --contract <ADDR> --tx <TX_HASH> --secret <HEX32> [--aadmode none|sender|context] [--hkdf]
 */

type Mode = 'key' | 'ecdh';
type AadMode = 'none' | 'sender' | 'context';

function assertMode(mode: string): asserts mode is Mode {
  if (!['key', 'ecdh'].includes(mode)) {
    throw new Error("mode must be 'key' or 'ecdh'");
  }
}

function assertAadMode(aadmode: string): asserts aadmode is AadMode {
  if (!['none', 'sender', 'context'].includes(aadmode)) {
    throw new Error("aadmode must be 'none', 'sender', or 'context'");
  }
}

function isAddressLike(s: string | undefined): s is string {
  return !!s && /^0x[0-9a-fA-F]{40}$/.test(s);
}

async function getAadBytes(
  hre: HardhatRuntimeEnvironment,
  aadmode: AadMode,
  senderFromEvent: string | undefined,
  contractAddr: string,
): Promise<Uint8Array> {
  const { ethers } = hre;
  if (aadmode === 'sender') {
    if (!senderFromEvent)
      throw new Error('Internal: sender missing from event for aadmode=sender');
    return ethers.getBytes(senderFromEvent);
  }
  if (aadmode === 'context') {
    const net = await ethers.provider.getNetwork();
    const packed = ethers.solidityPacked(
      ['uint256', 'address'],
      [net.chainId, contractAddr],
    );
    return ethers.getBytes(packed);
  }
  return new Uint8Array();
}

async function deriveEcdhKey(
  hre: HardhatRuntimeEnvironment,
  ecdhContractAddr: string,
  callerSecretHex: string,
): Promise<Uint8Array> {
  const { ethers } = hre;
  const ecdh = await ethers.getContractAt(
    'EncryptedEventsECDH',
    ecdhContractAddr,
  );
  const contractPkHex: string = await ecdh.contractPk();
  return mraeDeoxysii.deriveSymmetricKey(
    ethers.getBytes(contractPkHex),
    ethers.getBytes(callerSecretHex),
  );
}

function warnContractParamIfTxHash(contract: string | undefined) {
  if (contract && !isAddressLike(contract)) {
    console.warn(
      'Warning: --contract should be a 0x-prefixed 20-byte address (not a tx hash). You provided:',
      contract,
    );
  }
}

// EMIT
task('emit', 'Emit an Encrypted event (key|ecdh)')
  .addParam('mode', 'key | ecdh')
  .addParam('contract', 'Contract address')
  .addOptionalParam('message', 'Plaintext to encrypt (emit)', 'Hello Sapphire')
  .addOptionalParam('key', 'Hex-encoded 32-byte symmetric key (key mode)')
  .addOptionalParam(
    'secret',
    'Hex-encoded 32-byte caller Curve25519 secret (ecdh mode)',
  )
  .addOptionalParam('aadmode', 'none | sender | context', 'none')
  .addFlag(
    'hkdf',
    'ECDH only: derive per-message key from (ECDH, nonce) off-chain (no effect on emit)',
  )
  .setAction(
    async ({ mode, contract, message, key, secret, aadmode, hkdf }, hre) => {
      const { ethers } = hre;

      assertMode(mode);
      assertAadMode(aadmode);
      if (!isAddressLike(contract)) {
        throw new Error(
          '--contract is required and must be a checksummed address for emit',
        );
      }
      warnContractParamIfTxHash(contract);

      if (mode === 'key') {
        const instance = await ethers.getContractAt(
          'EncryptedEvents',
          contract,
        );
        const keyHex =
          (key as `0x${string}`) ??
          (ethers.hexlify(ethers.randomBytes(32)) as `0x${string}`);
        const data = ethers.hexlify(ethers.toUtf8Bytes(message));

        let txr;
        if (aadmode === 'sender') {
          txr = await (instance as any).emitEncryptedWithAad(keyHex, data);
        } else if (aadmode === 'context') {
          txr = await (instance as any).emitEncryptedWithContextAad(
            keyHex,
            data,
          );
        } else {
          txr = await instance.emitEncrypted(keyHex, data);
        }

        const receipt = await txr.wait();
        console.log('Encrypted event emitted in tx:', receipt?.hash);
        console.log('Symmetric key (hex):', keyHex);
        if (aadmode !== 'none') {
          console.log(`AAD mode used: ${aadmode}`);
          if (aadmode === 'sender') {
            console.warn(
              'Note: AAD binds to msg.sender (emitted as the first event arg). Use that same value when decrypting.',
            );
          } else {
            console.warn(
              'Note: AAD binds to (chainId, contract). Ensure you compute the same bytes off-chain when decrypting.',
            );
          }
        }
        if (hkdf) {
          console.warn(
            '--hkdf has no effect on EMIT; encryption happens on-chain. Only use --hkdf when LISTEN/DECRYPT against a contract that also applies HKDF on-chain.',
          );
        }
        return;
      }

      // ECDH mode
      const instance = await ethers.getContractAt(
        'EncryptedEventsECDH',
        contract,
      );
      const callerSecretBytes = secret
        ? ethers.getBytes(secret)
        : ethers.randomBytes(32);
      if (callerSecretBytes.length !== 32)
        throw new Error('Caller secret must be 32 bytes');
      const callerPublic = x25519.getPublicKey(callerSecretBytes);
      const callerPkHex = ethers.hexlify(callerPublic) as `0x${string}`;
      const data = ethers.hexlify(ethers.toUtf8Bytes(message));

      let txr2;
      if (aadmode === 'sender') {
        txr2 = await (instance as any).emitEncryptedECDHWithAad(
          callerPkHex,
          data,
        );
      } else if (aadmode === 'context') {
        txr2 = await (instance as any).emitEncryptedECDHWithContextAad(
          callerPkHex,
          data,
        );
      } else {
        txr2 = await instance.emitEncryptedECDH(callerPkHex, data);
      }
      const receipt2 = await txr2.wait();

      console.log('Encrypted event emitted in tx:', receipt2?.hash);
      console.log('Caller Curve25519 public key (hex):', callerPkHex);
      // DEMO ONLY – DO NOT log or print secrets in production systems.
      console.warn('DEMO ONLY: Do not log secret keys in production!');
      console.log(
        'Caller Curve25519 SECRET key (hex):',
        ethers.hexlify(callerSecretBytes),
      );
      if (aadmode !== 'none') {
        console.log(`AAD mode used: ${aadmode}`);
        if (aadmode === 'sender') {
          console.warn(
            'Note: AAD binds to msg.sender (and is emitted as the first event arg). Use that value off-chain for decryption.',
          );
        } else {
          console.warn(
            'Note: AAD binds to (chainId, contract). Ensure you compute the same bytes off-chain when decrypting.',
          );
        }
      }
      if (hkdf) {
        console.warn(
          '--hkdf has no effect on EMIT; encryption happens on-chain. Only use --hkdf when LISTEN/DECRYPT against a contract that also applies HKDF on-chain.',
        );
      }
    },
  );

// LISTEN
task('listen', 'Listen and decrypt Encrypted events (key|ecdh)')
  .addParam('mode', 'key | ecdh')
  .addParam('contract', 'Contract address')
  .addOptionalParam('key', 'Hex-encoded 32-byte symmetric key (key mode)')
  .addOptionalParam(
    'secret',
    'Hex-encoded 32-byte caller Curve25519 secret (ecdh mode)',
  )
  .addOptionalParam('aadmode', 'none | sender | context', 'none')
  .addFlag(
    'hkdf',
    'ECDH only: derive per-message key from (ECDH, nonce) off-chain',
  )
  .setAction(async ({ mode, contract, key, secret, aadmode, hkdf }, hre) => {
    const { ethers } = hre;

    assertMode(mode);
    assertAadMode(aadmode);
    if (!isAddressLike(contract)) {
      throw new Error(
        '--contract is required and must be a checksummed address for listen',
      );
    }
    warnContractParamIfTxHash(contract);

    const net = await ethers.provider.getNetwork();
    if (net.chainId === BigInt(0x5afd)) {
      console.warn(
        'Note: sapphire-localnet does not yet support event filters/subscriptions, so live `listen` cannot work there. ' +
          'Use `emit` + `decrypt --tx <hash>` on localnet, or run `listen` on sapphire-testnet/mainnet.',
      );
      return;
    }

    if (mode === 'key') {
      if (!key) throw new Error('--key is required in key mode for listen');
      if (hkdf) console.warn('--hkdf is ignored in key mode.');
      const instance = await ethers.getContractAt('EncryptedEvents', contract);

      console.log('Listening for Encrypted events (Ctrl-C to quit)');
      if (aadmode !== 'none') {
        console.warn(`AAD mode: ${aadmode}.`);
      }

      const aead = new AEAD(ethers.getBytes(key)); // same key for all events
      instance.on(instance.filters.Encrypted(), async (...args: unknown[]) => {
        try {
          let sender: string, nonce: string, ciphertext: string;
          // Shape A: ethers v6 gives single payload/log with .args (WS/polling)
          if (args.length === 1 && (args[0] as { args?: unknown[] })?.args) {
            [sender, nonce, ciphertext] = (
              args[0] as { args: [string, string, string] }
            ).args;
            // Shape B: ethers gives decoded params positionally
          } else {
            [sender, nonce, ciphertext] = args as [string, string, string];
          }
          const aadBytes = await getAadBytes(hre, aadmode, sender, contract);
          const plaintext = aead.decrypt(
            ethers.getBytes(nonce).slice(0, NonceSize),
            ethers.getBytes(ciphertext),
            aadBytes,
          );
          console.log('Decrypted:', new TextDecoder().decode(plaintext));
        } catch (e) {
          console.error('Failed to decrypt event:', e);
        }
      });

      process.on('SIGINT', () => {
        try {
          instance.removeAllListeners();
        } catch {}
        process.exit(0);
      });
      await new Promise<void>(() => {
        /* keep open */
      });
      return;
    }

    // ECDH listen
    if (!secret)
      throw new Error('--secret is required in ecdh mode for listen');

    const instance2 = await ethers.getContractAt(
      'EncryptedEventsECDH',
      contract,
    );

    console.log('Listening (ECDH) for Encrypted events (Ctrl-C to quit)');
    if (aadmode !== 'none') {
      console.warn(`AAD mode: ${aadmode}.`);
    }
    if (hkdf) {
      console.warn(
        'Note: --hkdf derives a per-message key off-chain using nonce. Your contract must encrypt with the same HKDF for this to succeed.',
      );
    }

    // Base ECDH key is constant for a given (contract, callerSecret)
    const baseKey = await deriveEcdhKey(hre, contract, secret);

    // If not using HKDF, reuse a single AEAD instance
    const aeadStatic = hkdf ? undefined : new AEAD(baseKey);

    instance2.on(instance2.filters.Encrypted(), async (...args: unknown[]) => {
      try {
        let sender: string, nonce: string, ciphertext: string;
        // Shape A: ethers v6 gives single payload/log with .args (WS/polling)
        if (args.length === 1 && (args[0] as { args?: unknown[] })?.args) {
          [sender, nonce, ciphertext] = (
            args[0] as { args: [string, string, string] }
          ).args;
          // Shape B: ethers gives decoded params positionally
        } else {
          [sender, nonce, ciphertext] = args as [string, string, string];
        }
        const aadBytes = await getAadBytes(hre, aadmode, sender, contract);
        const n15 = ethers.getBytes(nonce).slice(0, NonceSize);

        let aead: AEAD;
        if (hkdf) {
          const sessionKey = hkdfSync(
            'sha256',
            Buffer.from(baseKey),
            Buffer.from(n15),
            Buffer.from('sapphire:events'),
            32,
          );
          aead = new AEAD(new Uint8Array(sessionKey));
        } else {
          aead = aeadStatic!;
        }

        const plaintext = aead.decrypt(
          n15,
          ethers.getBytes(ciphertext),
          aadBytes,
        );
        console.log('Decrypted (ECDH):', new TextDecoder().decode(plaintext));
      } catch (e) {
        console.error('Failed to decrypt event:', e);
      }
    });

    process.on('SIGINT', () => {
      try {
        instance2.removeAllListeners();
      } catch {}
      process.exit(0);
    });
    await new Promise<void>(() => {
      /* keep open */
    });
  });

// DECRYPT (past tx by hash)
task('decrypt', 'Decrypt an Encrypted event from a past transaction (key|ecdh)')
  .addParam('mode', 'key | ecdh')
  .addParam('tx', 'Transaction hash containing the Encrypted event')
  .addOptionalParam(
    'contract',
    'Contract address (optional for key mode; required for ecdh mode)',
  )
  .addOptionalParam('key', 'Hex-encoded 32-byte symmetric key (key mode)')
  .addOptionalParam(
    'secret',
    'Hex-encoded 32-byte caller Curve25519 secret (ecdh mode)',
  )
  .addOptionalParam('aadmode', 'none | sender | context', 'none')
  .addFlag(
    'hkdf',
    'ECDH only: derive per-message key from (ECDH, nonce) off-chain',
  )
  .setAction(
    async ({ mode, tx, contract, key, secret, aadmode, hkdf }, hre) => {
      const { ethers } = hre;

      assertMode(mode);
      assertAadMode(aadmode);
      if (mode === 'ecdh' && !isAddressLike(contract)) {
        throw new Error(
          '--contract is required and must be a checksummed address for decrypt in ecdh mode',
        );
      }
      if (contract) warnContractParamIfTxHash(contract);

      const receipt = await ethers.provider.getTransactionReceipt(tx);
      if (!receipt) throw new Error('Transaction not found or not mined');

      // Minimal interface for parsing the Encrypted event
      const iface = new ethers.Interface([
        'event Encrypted(address indexed sender, bytes32 nonce, bytes ciphertext)',
      ]);

      const target = contract ? contract.toLowerCase() : undefined;

      // Parse all matching Encrypted logs (optionally filter by contract)
      const matches: Array<{ parsed: any; address: string }> = [];
      for (const l of receipt.logs) {
        try {
          if (target && (l.address ?? '').toLowerCase() !== target) continue;
          const p = iface.parseLog(l);
          if (p && p.name === 'Encrypted') {
            matches.push({
              parsed: p,
              address: (l.address ?? '').toLowerCase(),
            });
          }
        } catch {
          /* ignore non-matching logs */
        }
      }

      if (matches.length === 0) {
        if (target)
          throw new Error(
            'Encrypted event not found for the provided contract in this transaction',
          );
        throw new Error('Encrypted event not found in tx logs');
      }
      if (!target && matches.length > 1) {
        console.warn(
          'Warning: Multiple Encrypted events found in this tx across different contracts. Please re-run with --contract <ADDR> to disambiguate.',
        );
        throw new Error('Ambiguous: multiple Encrypted events');
      }

      const chosen = matches[0];
      const sender: string = chosen.parsed.args[0];
      const nonce: string = chosen.parsed.args[1];
      const ciphertext: string = chosen.parsed.args[2];

      if (mode === 'key') {
        if (!key) throw new Error('--key is required in key mode for decrypt');
        if (hkdf) console.warn('--hkdf is ignored in key mode.');
        const aead = new AEAD(ethers.getBytes(key));
        const aadBytes = await getAadBytes(
          hre,
          aadmode,
          aadmode === 'sender' ? sender : undefined,
          (contract ?? chosen.address) as string,
        );
        const plaintext = aead.decrypt(
          ethers.getBytes(nonce).slice(0, NonceSize),
          ethers.getBytes(ciphertext),
          aadBytes,
        );
        console.log('Decrypted message:', new TextDecoder().decode(plaintext));
        return;
      }

      // ecdh mode
      if (!secret)
        throw new Error('--secret is required in ecdh mode for decrypt');

      const targetAddr = (contract ?? chosen.address) as string;
      const baseKey = await deriveEcdhKey(hre, targetAddr, secret);

      const aadBytes2 = await getAadBytes(
        hre,
        aadmode,
        aadmode === 'sender' ? sender : undefined,
        targetAddr,
      );
      const n15 = ethers.getBytes(nonce).slice(0, NonceSize);

      let aead2: AEAD;
      if (hkdf) {
        const sessionKey = hkdfSync(
          'sha256',
          Buffer.from(baseKey),
          Buffer.from(n15),
          Buffer.from('sapphire:events'),
          32,
        );
        aead2 = new AEAD(new Uint8Array(sessionKey));
      } else {
        aead2 = new AEAD(baseKey);
      }

      const plaintext2 = aead2.decrypt(
        n15,
        ethers.getBytes(ciphertext),
        aadBytes2,
      );
      console.log(
        'Decrypted message (ECDH):',
        new TextDecoder().decode(plaintext2),
      );
    },
  );
