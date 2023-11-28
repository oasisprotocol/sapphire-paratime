---
description: "Secure dApps: Recipes for Confidentiality"
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
    // set and lock recipient
    _height = block.number;
  }

  /// @notice Reveals the secret.
  function revealSecret() view external returns (bytes memory) {
    require(block.number >= _height, "not settled");
    // check for recipient
    return _secret;
  }
}
```

## Gas Padding

To prevent leaking information about a particular transaction, Sapphire
provides a [precompile] for dApp developers to **pad the amount of gas used
in a transaction**.

```solidity
contract GasExample {
  bytes32 tmp;

  function constantMath(bool doMath, uint128 padGasAmount) external {
    if (doMath) {
      bytes32 x;

      for (uint256 i = 0; i < 100; i++) {
        x = keccak256(abi.encodePacked(x, tmp));
      }

      tmp = x;
    }

    Sapphire.padGas(padGasAmount);
  }
}
```

Both contract calls below should use the same amount of gas. Sapphire also
provides the precompile to return the gas [used] by the current transaction.

```typescript
await contract.constantMath(true, 100000);
await contract.constantMath(false, 100000);
```

[gas]: https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html
[hardhat-tracer]: https://www.npmjs.com/package/hardhat-tracer
[precompile]: https://api.docs.oasis.io/sol/sapphire-contracts/contracts/Sapphire.sol/library.Sapphire.html#padgas
[used]: https://api.docs.oasis.io/sol/sapphire-contracts/contracts/Sapphire.sol/library.Sapphire.html#gasused
