# Encrypted Events Demo (Oasis Sapphire)

Minimal, production‑ready patterns for emitting **confidential** events on
Sapphire and decrypting them off‑chain.

- **Event:** `event Encrypted(address indexed sender, bytes32 nonce, bytes ciphertext);`
- **AEAD:** Deoxys‑II (`NonceSize = 15`); we store a 32‑byte nonce on‑chain
  and use only the first 15 bytes for decryption.
- **Two flows**
  - **A — Key in tx (default):** pass a 32‑byte symmetric key in an
    **encrypted** tx.
  - **B — On‑chain ECDH:** derive the symmetric key via X25519 between
    caller and contract.

## Requirements

- Node 18+
- Docker (for Localnet)
- Git

## 1) Start Sapphire Localnet

```bash
docker run -it -p8544-8548:8544-8548 ghcr.io/oasisprotocol/sapphire-localnet
# On Apple Silicon, add: --platform linux/x86_64  (if the image lacks arm64)
```

## 2) Install Dependencies

This example is part of the `sapphire-paratime` monorepo. From this
directory (`examples/encrypted-events`), run:

```bash
pnpm install
cp .env.example .env   # paste a 0x‑prefixed private key

pnpm build
# (Optional) Better typings for overloads:
pnpm run build:types    # runs hardhat compile + typechain
```

## 3) Flow A — Key in the (encrypted) tx

> Only on Sapphire. Passing a raw key in calldata is safe only on Sapphire
> networks because the Sapphire wrappers encrypt tx/calls. Do not use this
> pattern on non‑Sapphire chains.

### On Localnet (deploy, emit, decrypt)

```bash
# Deploy
npx hardhat deploy --network sapphire-localnet
# copy printed address to $ADDR  (this is the CONTRACT address, not a tx hash)

# Emit (prints the symmetric key). Select AAD if desired:
#   --aadmode none|sender|context
# Tip: provide --key to reuse the same key across emit & decrypt.
npx hardhat emit --network sapphire-localnet \
  --mode key --contract $ADDR \
  --message "secret" [--key <HEX32>] [--aadmode sender|context]

# Decrypt a past tx by hash (add --aadmode if you used it when emitting)
# (In key mode, --contract is optional; pass it to disambiguate if the tx
# has multiple logs.)
npx hardhat decrypt --network sapphire-localnet \
  --mode key [--contract $ADDR] \
  --tx <TX_HASH> --key <PRINTED_OR_PROVIDED_KEY> [--aadmode sender|context]
```

### Live Listen (Testnet/Mainnet only)

Live event listening requires RPC support for log filters/subscriptions, which
**sapphire-localnet does not currently support**. To test `listen`, deploy on Testnet:

```bash
# Deploy on Testnet
npx hardhat deploy --network sapphire-testnet
# copy printed address to $ADDR

# Live listen & decrypt (stays open until Ctrl‑C; add --aadmode if you used it)
npx hardhat listen --network sapphire-testnet \
  --mode key --contract $ADDR \
  --key <HEX32> [--aadmode sender|context]
```

### Quickest test (two terminals, Testnet)

Terminal A – listener

```bash
# First deploy on testnet and copy the address
npx hardhat deploy --network sapphire-testnet
export ADDR=<DEPLOYED_ADDRESS>
export KEY=0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
npx hardhat listen --network sapphire-testnet \
  --mode key --contract $ADDR --key $KEY
```

Terminal B – emitter

```bash
npx hardhat emit --network sapphire-testnet \
  --mode key --contract $ADDR --message "secret" --key $KEY
```

**Expected:** Terminal A prints `Decrypted: secret`.

**Tip:** `--contract` is **always** a contract address (0x…), not a tx hash.

## 4) Flow B — On‑chain ECDH (X25519)

### ECDH on Localnet (deploy, emit, decrypt)

```bash
# Deploy (prints the contract's Curve25519 public key)
npx hardhat deploy-ecdh --network sapphire-localnet
# copy printed address to $ADDR

# Emit (generates an ephemeral caller keypair; DEMO prints the SECRET).
# Select AAD if desired: --aadmode none|sender|context
# Tip: provide --secret to reuse the same caller secret across emit & decrypt.
npx hardhat emit --network sapphire-localnet \
  --mode ecdh --contract $ADDR \
  --message "secret" [--secret <HEX32>] [--aadmode sender|context]

# Decrypt a past tx (ECDH — needs the contract to fetch its public key)
npx hardhat decrypt --network sapphire-localnet \
  --mode ecdh --contract $ADDR \
  --tx <TX_HASH> --secret <HEX32> [--aadmode sender|context] [--hkdf]
```

### ECDH Live Listen (Testnet/Mainnet only)

```bash
# Deploy on Testnet first
npx hardhat deploy-ecdh --network sapphire-testnet
# copy printed address to $ADDR

# Live listen & decrypt using the provided/printed caller SECRET
# (add --aadmode if you used it)
# Optional: --hkdf for per-message keys (requires a matching on-chain variant).
npx hardhat listen --network sapphire-testnet \
  --mode ecdh --contract $ADDR \
  --secret <HEX32> [--aadmode sender|context] [--hkdf]
```

**IMPORTANT (ECDH):** Off‑chain, derive the AEAD key from the X25519 keys
using the **official SDK helper**:

```ts
import { mraeDeoxysii } from '@oasisprotocol/client-rt';
// contractPublic: Uint8Array(32), callerSecret: Uint8Array(32)
const key = mraeDeoxysii.deriveSymmetricKey(contractPublic, callerSecret);
const aead = new AEAD(key);
```

This mirrors Sapphire’s on‑chain derivation.

## Tests

Run against Localnet (the tests skip on non‑Sapphire networks):

```bash
pnpm test
# or: npx hardhat test --network sapphire-localnet
```

## How it Works

The core logic is:

1. **Nonce**: `bytes32 n = bytes32(Sapphire.randomBytes(32, ...));`
2. **Encrypt**: `bytes c = Sapphire.encrypt(key, n, message, aad);`
3. **Emit**: `emit Encrypted(msg.sender, n, c);`
4. **Decrypt**: Use `@oasisprotocol/deoxysii` off-chain.

**Nonce size:** Deoxys‑II uses a **120‑bit (15 bytes)** nonce. We store 32
bytes on chain and slice only the first 15 bytes for decryption.

**Gas note:** If you emit a **non‑indexed** `bytes15 nonce` instead of
`bytes32`, you save ~136 gas per event. We keep `bytes32` for simplicity and
future derivations.

## Best Practices & Tips

- **AAD modes**: Bind ciphertext to context. AAD bytes must match exactly
  between encryption and decryption.

  - `sender`: `abi.encodePacked(msg.sender)`. Use the emitted `sender`
    (20 bytes). Relayer-aware.
  - `context`: `abi.encodePacked(block.chainid, address(this))`. Use
    `solidityPacked(["uint256","address"], [chainId, contractAddr])`.
    Relayer-agnostic.
  - `none`: No authenticity binding (simplest).

- **HKDF option:** For ECDH mode, if you pass `--hkdf`, the listener/decrypt
  script will derive a per‑message key from `(ECDH shared key, nonce)`
  using HKDF. Your **contract must encrypt with the same HKDF** or
  decryption will fail. The demo contracts do **not** apply HKDF on-chain.

- **Nonce personalization**: Use a domain separator for nonce generation to
  prevent collisions, e.g., `Sapphire.randomBytes(32, bytes("MyDapp:nonce"))`.

- **Index wisely**: Indexing `sender` is useful for filtering. Indexing a
  random nonce is not.

- **Security:**

  - **Never reuse `(key, nonce)`**. Always use a fresh random nonce.
  - **Do not log secrets** (keys or Curve25519 secret keys) in production.
    This demo prints them for convenience.
  - **Plaintext length leaks size**. If sensitive, pad to a fixed size
    client‑side before encrypting.
  - **Events are permanent.** Emit only what can remain confidential long-term.
  - **Testnet is not production.** Confidentiality is not guaranteed.

- **Listeners stay open** until you press **Ctrl‑C**.

- **Ethers listeners**: Receive `(sender, nonce, ciphertext, event)`. You
  can also read the indexed `sender` from `event.args.sender`.

## License: Apache-2.0
