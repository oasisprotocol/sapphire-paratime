---
description: Recipes for Confidentiality, Security considerations when writing confidential contracts
---

# Security

This page is an ongoing work in progress to support confidential smart contract
development. At the moment we address safeguarding storage variable access
patterns and provide best practices for more secure orderings of error checking
to prevent leaking contract state.

## Storage Access Patterns

You can use a tool such as [hardhat-tracer] to examine the base EVM state
transitions under the hood.

```shell npm2yarn
npm install -D hardhat-tracer
```

and add `hardhat-tracer` to your `config.ts` file,

```typescript
import "hardhat-tracer"
```

in order to test and show call traces.

```shell
npx hardhat test --vvv --opcodes SSTORE,SLOAD
```

You can also trace a particular transaction, once you know its hash.

```shell
npx hardhat trace --hash 0xTransactionHash
```

For both [gas] usage and confidentiality purposes, we **recommend using
non-unique data size**. E.g. 64-byte value will still be distinct from a
128-byte value.

:::caution Inference based on access patterns

`SSTORE` keys from one transaction may be linked to `SLOAD` keys of another
transaction.

:::

## Order of Operations

When handling errors, gas usage patterns not only can reveal the code path
taken, **but sometimes the balance of a user as well** (in the case of a diligent
attacker using binary search).

```solidity
function transferFrom(address who, address to, uint amount)
  external
{
  require( balances[who] >= amount );
  require( allowances[who][msg.sender] >= amount );
  // ...
}
```

Modifying the order of error checking can prevent the accidental disclosure of
balance information in the example above.

```solidity
function transferFrom(address who, address to, uint amount)
  external
{
  require( allowances[who][msg.sender] >= amount );
  require( balances[who] >= amount );
  // ...
}
```

## Speed Bump

If we would like to prevent off-chain calls from being chained together, we can
ensure that the block has been finalized.

```solidity
contract Secret {
  uint256 private _height;
  bytes private _secret;
  address private _buyer;

  constructor(bytes memory _text) {
    _secret = _text;
  }

  function recordPayment() external payable {
    require(msg.value == 1 ether);
    // set and lock buyer
    _height = block.number;
    _buyer = msg.sender;
  }

  /// @notice Reveals the secret.
  function revealSecret() view external returns (bytes memory) {
    require(block.number > _height, "not settled");
    require(_buyer != address(0), "no recorded buyer");
    // TODO: optionally authenticate call from buyer
    return _secret;
  }
}
```

## Gas Padding

Gas padding lets you equalize **EVM execution** gas across private code paths to
reduce side‑channel leakage. Sapphire provides a precompile
([`Sapphire.padGas`][precompile]) that burns execution gas so that your
function’s execution cost is brought up to a target amount. The gas padding
call is usually done somewhere at the end of the executed code to cover all
possible execution paths.

Scope & limits:

- Pads **only the EVM engine (execution) gas** spent by your contract’s code
  path. It **does not** include the intrinsic/transaction‑size component
  (calldata bytes, signature, envelope, etc.). The transaction size and the fee
  attributable to it remains public.
- Practically: if you pad to `10_000`, the total fee is `tx_size_gas +
exec_gas_padded(≈10_000)`.
- Padding is intentionally limited to the execution layer. If total gas were
  fully padded, an attacker could vary transaction size to leak information;
  therefore only the EVM execution portion is padded.
- `padGas` protects the code path **within your contract**. Gas used by
  external calls can still differ unless those contracts also pad.

### Example attack (leaky code path)

```solidity
contract Leaky {
  bytes32 private secret;
  bytes32 private tmp;

  // Returns true on correct guess; success path does extra work
  // (leaks via fee).
  function guess(bytes32 candidate) external returns (bool ok) {
    if (candidate == secret) {
      for (uint i = 0; i < 10_000; ++i) {
        tmp = keccak256(abi.encodePacked(tmp, i));
      }
      return true;
    }
    return false;
  }
}
```

An observer (or the caller) can compare total fees and infer whether
`candidate == secret`.

### Fix with padding

```solidity
contract Padded {
  bytes32 private secret;
  bytes32 private tmp;

  function guess(bytes32 candidate) external returns (bool ok) {
    if (candidate == secret) {
      for (uint i = 0; i < 10_000; ++i) {
        tmp = keccak256(abi.encodePacked(tmp, i));
      }
      ok = true;
    }
    // Equalize execution cost across branches. Pads execution only
    // tx size cost stays visible.
    Sapphire.padGas(100_000);
  }
}
```

Choose a target that is greater or equal to the **worst‑case execution** for the function, with
a safety margin. You can measure worst‑case cost in tests (e.g., with
tracers) and read the current execution gas via [`Sapphire.gasUsed()`][used].

### When to use

- Branches depend on confidential state/input and have materially different
  execution cost.
- Success vs. revert paths would leak acceptance via fee differences.
- Before returning from functions that conditionally perform heavy computation.

### When _not_ to rely on it (alone)

- It does **not** hide **transaction size** (calldata length). Different‑length
  inputs will still lead to different total fees.
- It does not pad external contracts you call unless **they** also pad.
- It is not a replacement for constant‑time logic where feasible.

### Masking input size (guidance)

- Prefer fixed‑size ABI types (`bytes32` instead of `bytes`) and pass
  **hashes** of variable‑length data rather than the data itself.
- If variable‑length bytes/ciphertext must be sent, **pad client‑side to a
  fixed length or to bucketized sizes** (e.g., 256/512/1024 bytes) before
  encrypting/sending; strip padding inside the contract.
- Bundle multiple fields into a fixed‑size envelope and parse lengths inside
  the confidential execution.

#### Simple example

```solidity
contract GasExample {
  bytes32 tmp;

  function constantMath(bool doMath, uint128 padTo) external {
    if (doMath) {
      bytes32 x;
      for (uint256 i = 0; i < 100; i++) {
        x = keccak256(abi.encodePacked(x, tmp));
      }
      tmp = x;
    }
    // Pads EVM execution only; tx size cost remains public.
    Sapphire.padGas(padTo);
  }
}
```

Both calls below will consume the **same execution gas**, while the
**transaction‑size gas** may still differ if calldata sizes differ. You can
also query the execution gas with [`Sapphire.gasUsed()`][used].

```typescript
await contract.constantMath(true, 100000);
await contract.constantMath(false, 100000);
```

[gas]: https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html
[hardhat-tracer]: https://www.npmjs.com/package/hardhat-tracer
[precompile]: https://api.docs.oasis.io/sol/sapphire-contracts/contracts/Sapphire.sol/library.Sapphire.html#padgas
[used]: https://api.docs.oasis.io/sol/sapphire-contracts/contracts/Sapphire.sol/library.Sapphire.html#gasused
