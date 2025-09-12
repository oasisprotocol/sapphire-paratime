import { task } from "hardhat/config";
import { AEAD, NonceSize } from "@oasisprotocol/deoxysii";
import { x25519 } from "@noble/curves/ed25519";
import { mraeDeoxysii } from "@oasisprotocol/client-rt";
import { hkdfSync } from "crypto";

/**
 * Unified command:
 *   EMIT (key):   npx hardhat enc --network <net> --action emit    --mode key  --contract <ADDR> [--message "..."] [--key <HEX32>] [--aadmode none|sender|context]
 *   EMIT (ecdh):  npx hardhat enc --network <net> --action emit    --mode ecdh --contract <ADDR> [--message "..."] [--secret <HEX32>] [--aadmode none|sender|context]
 *   LISTEN (key): npx hardhat enc --network <net> --action listen  --mode key  --contract <ADDR> --key <HEX32> [--aadmode none|sender|context]
 *   LISTEN (ecdh):npx hardhat enc --network <net> --action listen  --mode ecdh --contract <ADDR> --secret <HEX32> [--aadmode none|sender|context] [--hkdf]
 *   DECRYPT (key):npx hardhat enc --network <net> --action decrypt --mode key  [--contract <ADDR>] --tx <TX_HASH> --key <HEX32> [--aadmode none|sender|context]
 *   DECRYPT (ecdh):npx hardhat enc --network <net> --action decrypt --mode ecdh --contract <ADDR> --tx <TX_HASH> --secret <HEX32> [--aadmode none|sender|context] [--hkdf]
 *
 * Legacy flag compatibility:
 *   --aad  (alias for --aadmode sender)  [DEPRECATED]
 *
 * Event signature (both contracts):
 *   event Encrypted(address indexed sender, bytes32 nonce, bytes ciphertext);
 */
task("enc", "Unified emit/listen/decrypt for encrypted events (key|ecdh)")
  .addParam("action", "emit | listen | decrypt")
  .addParam("mode", "key | ecdh")
  .addOptionalParam("contract", "Contract address")
  .addOptionalParam("message", "Plaintext to encrypt (emit)", "Hello Sapphire")
  .addOptionalParam("key", "Hex-encoded 32-byte symmetric key (key mode)")
  .addOptionalParam("secret", "Hex-encoded 32-byte caller Curve25519 secret (ecdh mode)")
  .addOptionalParam("tx", "Transaction hash containing the Encrypted event (decrypt)")
  .addOptionalParam("aadmode", "none | sender | context", "none")
  .addFlag("aad", "DEPRECATED: alias for --aadmode sender")
  .addFlag("hkdf", "ECDH only: derive per-message key from (ECDH, nonce) off-chain")
  .setAction(async ({ action, mode, contract, message, key, secret, tx, aadmode, aad, hkdf }, hre) => {
    const { ethers } = hre;

    // legacy alias: --aad -> --aadmode sender
    if (aad && aadmode === "none") {
      console.warn("Warning: --aad is deprecated; use --aadmode sender. Proceeding with aadmode=sender.");
      aadmode = "sender";
    }
    if (!["emit", "listen", "decrypt"].includes(action)) {
      throw new Error("action must be 'emit', 'listen', or 'decrypt'");
    }
    if (!["key", "ecdh"].includes(mode)) {
      throw new Error("mode must be 'key' or 'ecdh'");
    }
    if (!["none", "sender", "context"].includes(aadmode)) {
      throw new Error("aadmode must be 'none', 'sender', or 'context'");
    }
    if ((action === "emit" || action === "listen") && !contract) {
      throw new Error("--contract is required for 'emit' and 'listen'");
    }
    if (action === "decrypt" && mode === "ecdh" && !contract) {
      throw new Error("--contract is required for decrypt in ecdh mode");
    }

    // Basic validation to catch users passing a tx hash to --contract by mistake
    const needsContract = (action === "emit" || action === "listen" || (action === "decrypt" && mode === "ecdh"));
    if (needsContract && contract && !/^0x[0-9a-fA-F]{40}$/.test(contract)) {
      console.warn("Warning: --contract should be a 0x-prefixed 20-byte address (not a tx hash). You provided:", contract);
    }

    // Helpers
    const getAadBytes = async (senderFromEvent: string | undefined, contractAddr: string): Promise<Uint8Array> => {
      if (aadmode === "sender") {
        if (!senderFromEvent) throw new Error("Internal: sender missing from event for aadmode=sender");
        return ethers.getBytes(senderFromEvent);
      }
      if (aadmode === "context") {
        const net = await ethers.provider.getNetwork();
        const packed = ethers.solidityPacked(["uint256", "address"], [net.chainId, contractAddr]);
        return ethers.getBytes(packed);
      }
      return new Uint8Array();
    };

    const deriveEcdhKey = async (ecdhContractAddr: string, callerSecretHex: string): Promise<Uint8Array> => {
      const ecdh = await ethers.getContractAt("EncryptedEventsECDH", ecdhContractAddr);
      const contractPkHex: string = await ecdh.contractPublicKey();
      return mraeDeoxysii.deriveSymmetricKey(
        ethers.getBytes(contractPkHex),
        ethers.getBytes(callerSecretHex)
      );
    };

    /* ---------------------------------------------------------------
     * EMIT
     * ------------------------------------------------------------- */
    if (action === "emit") {
      if (mode === "key") {
        const instance = await ethers.getContractAt("EncryptedEvents", contract as string);
        const keyHex = (key as `0x${string}`) ?? (ethers.hexlify(ethers.randomBytes(32)) as `0x${string}`);
        const data = ethers.hexlify(ethers.toUtf8Bytes(message));

        let txr;
        if (aadmode === "sender") {
          txr = await instance.getFunction("emitEncryptedWithAad")(keyHex, data);
        } else if (aadmode === "context") {
          txr = await instance.getFunction("emitEncryptedWithContextAad")(keyHex, data);
        } else {
          txr = await instance.emitEncrypted(keyHex, data);
        }

        const receipt = await txr.wait();
        console.log("Encrypted event emitted in tx:", receipt?.hash);
        console.log("Symmetric key (hex):", keyHex);
        if (aadmode !== "none") {
          console.log(`AAD mode used: ${aadmode}`);
          if (aadmode === "sender") {
            console.warn("Note: AAD binds to msg.sender (emitted as the first event arg). Use that same value when decrypting.");
          } else {
            console.warn("Note: AAD binds to (chainId, contract). Ensure you compute the same bytes off-chain when decrypting.");
          }
        }
        return;
      }

      // ECDH emit
      const instance = await ethers.getContractAt("EncryptedEventsECDH", contract as string);
      const callerSecretBytes = secret ? ethers.getBytes(secret) : ethers.randomBytes(32);
      if (callerSecretBytes.length !== 32) throw new Error("Caller secret must be 32 bytes");
      const callerPublic = x25519.getPublicKey(callerSecretBytes);
      const callerPkHex = ethers.hexlify(callerPublic) as `0x${string}`;
      const data = ethers.hexlify(ethers.toUtf8Bytes(message));

      let txr;
      if (aadmode === "sender") {
        txr = await (instance as any).emitEncryptedECDHWithAad(callerPkHex, data);
      } else if (aadmode === "context") {
        txr = await (instance as any).emitEncryptedECDHWithContextAad(callerPkHex, data);
      } else {
        txr = await instance.emitEncryptedECDH(callerPkHex, data);
      }
      const receipt = await txr.wait();

      console.log("Encrypted event emitted in tx:", receipt?.hash);
      console.log("Caller Curve25519 public key (hex):", callerPkHex);
      // DEMO ONLY – DO NOT log or print secrets in production systems.
      console.warn("DEMO ONLY: Do not log secret keys in production!");
      console.log("Caller Curve25519 SECRET key (hex):", ethers.hexlify(callerSecretBytes));
      if (aadmode !== "none") {
        console.log(`AAD mode used: ${aadmode}`);
        if (aadmode === "sender") {
          console.warn("Note: AAD binds to msg.sender (and is emitted as the first event arg). Use that value off-chain for decryption.");
        } else {
          console.warn("Note: AAD binds to (chainId, contract). Ensure you compute the same bytes off-chain when decrypting.");
        }
      }
      if (hkdf) {
        console.warn("--hkdf has no effect on EMIT; encryption happens on-chain. Only use --hkdf when LISTEN/DECRYPT against a contract that also applies HKDF on-chain.");
      }
      return;
    }

    /* ---------------------------------------------------------------
     * LISTEN
     * ------------------------------------------------------------- */
    if (action === "listen") {
      if (mode === "key") {
        if (!key) throw new Error("--key is required in key mode for listen");
        if (hkdf) console.warn("--hkdf is ignored in key mode.");
        const instance = await ethers.getContractAt("EncryptedEvents", contract as string);
        const filter = instance.filters.Encrypted(undefined);

        console.log("Listening for Encrypted events (Ctrl-C to quit)");
        if (aadmode !== "none") {
          console.warn(`AAD mode: ${aadmode}.`);
        }

        const aead = new AEAD(ethers.getBytes(key)); // same key for all events
        instance.on(filter, async (sender: string, nonce: string, ciphertext: string, event: any): Promise<void> => {
          try {
            const aadBytes = await getAadBytes(sender, contract as string);
            const plaintext = aead.decrypt(
              ethers.getBytes(nonce).slice(0, NonceSize),
              ethers.getBytes(ciphertext),
              aadBytes
            );
            console.log("Decrypted:", new TextDecoder().decode(plaintext));
          } catch (e) {
            console.error("Failed to decrypt event:", e);
          }
        });

        process.on("SIGINT", () => {
          try { instance.removeAllListeners(); } catch {}
          process.exit(0);
        });
        await new Promise<void>(() => { /* forever */ });
        return;
      }

      // LISTEN ECDH
      if (!secret) throw new Error("--secret is required in ecdh mode for listen");
      const instance = await ethers.getContractAt("EncryptedEventsECDH", contract as string);
      const filter = instance.filters.Encrypted(undefined);

      console.log("Listening (ECDH) for Encrypted events (Ctrl-C to quit)");
      if (aadmode !== "none") {
        console.warn(`AAD mode: ${aadmode}.`);
      }
      if (hkdf) {
        console.warn("Note: --hkdf derives a per-message key off-chain using nonce. Your contract must encrypt with the same HKDF for this to succeed.");
      }

      // Base ECDH key is constant for a given (contract, callerSecret)
      const baseKey = await deriveEcdhKey(contract as string, secret);

      // If not using HKDF, we can reuse a single AEAD instance
      const aeadStatic = hkdf ? undefined : new AEAD(baseKey);

      instance.on(filter, async (sender: string, nonce: string, ciphertext: string, event: any): Promise<void> => {
        try {
          const aadBytes = await getAadBytes(sender, contract as string);
          const n15 = ethers.getBytes(nonce).slice(0, NonceSize);

          let aead: AEAD;
          if (hkdf) {
            const sessionKey = hkdfSync("sha256", Buffer.from(baseKey), Buffer.from(n15), Buffer.from("sapphire:events"), 32);
            aead = new AEAD(new Uint8Array(sessionKey));
          } else {
            aead = aeadStatic!;
          }

          const plaintext = aead.decrypt(
            n15,
            ethers.getBytes(ciphertext),
            aadBytes
          );
          console.log("Decrypted (ECDH):", new TextDecoder().decode(plaintext));
        } catch (e) {
          console.error("Failed to decrypt event:", e);
        }
      });

      process.on("SIGINT", () => {
        try { instance.removeAllListeners(); } catch {}
        process.exit(0);
      });
      await new Promise<void>(() => { /* forever */ });
      return;
    }

    /* ---------------------------------------------------------------
     * DECRYPT (past tx by hash)
     * ------------------------------------------------------------- */
    if (!tx) throw new Error("--tx is required for decrypt");
    const receipt = await ethers.provider.getTransactionReceipt(tx);
    if (!receipt) throw new Error("Transaction not found or not mined");

    // Minimal interface for parsing the Encrypted event
    const iface = new ethers.Interface([
      "event Encrypted(address indexed sender, bytes32 nonce, bytes ciphertext)"
    ]);

    const target = typeof contract === "string" && contract ? (contract as string).toLowerCase() : undefined;

    // Parse all matching Encrypted logs (optionally filter by contract)
    const matches: any[] = [];
    for (const l of receipt.logs) {
      try {
        if (target && (l.address ?? "").toLowerCase() !== target) continue;
        const p = iface.parseLog(l);
        if (p && p.name === "Encrypted") { matches.push({ parsed: p, address: (l.address ?? "").toLowerCase() }); }
      } catch { /* ignore non-matching logs */ }
    }

    if (matches.length === 0) {
      if (target) throw new Error("Encrypted event not found for the provided contract in this transaction");
      throw new Error("Encrypted event not found in tx logs");
    }
    if (!target && matches.length > 1) {
      console.warn("Warning: Multiple Encrypted events found in this tx across different contracts. Please re-run with --contract <ADDR> to disambiguate.");
      throw new Error("Ambiguous: multiple Encrypted events");
    }

    const chosen = target ? matches[0] : matches[0];
    const sender: string = chosen.parsed.args[0];
    const nonce: string = chosen.parsed.args[1];
    const ciphertext: string = chosen.parsed.args[2];

    if (mode === "key") {
      if (!key) throw new Error("--key is required in key mode for decrypt");
      if (hkdf) console.warn("--hkdf is ignored in key mode.");
      const aead = new AEAD(ethers.getBytes(key));
      const aadBytes = await getAadBytes(aadmode === "sender" ? sender : undefined, (contract ?? chosen.address) as string);
      const plaintext = aead.decrypt(
        ethers.getBytes(nonce).slice(0, NonceSize),
        ethers.getBytes(ciphertext),
        aadBytes
      );
      console.log("Decrypted message:", new TextDecoder().decode(plaintext));
      return;
    }

    // ecdh mode
    if (!secret) throw new Error("--secret is required in ecdh mode for decrypt");

    const targetAddr = (contract ?? chosen.address) as string;
    const baseKey2 = await deriveEcdhKey(targetAddr, secret);

    const aadBytes2 = await getAadBytes(aadmode === "sender" ? sender : undefined, targetAddr);
    const n15 = ethers.getBytes(nonce).slice(0, NonceSize);

    let aead2: AEAD;
    if (hkdf) {
      const sessionKey = hkdfSync("sha256", Buffer.from(baseKey2), Buffer.from(n15), Buffer.from("sapphire:events"), 32);
      aead2 = new AEAD(new Uint8Array(sessionKey));
    } else {
      aead2 = new AEAD(baseKey2);
    }

    const plaintext2 = aead2.decrypt(
      n15,
      ethers.getBytes(ciphertext),
      aadBytes2
    );
    console.log("Decrypted message (ECDH):", new TextDecoder().decode(plaintext2));
  });