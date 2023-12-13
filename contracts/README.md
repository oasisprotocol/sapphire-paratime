# Sapphire Contracts Lib

[NPM](https://www.npmjs.com/package/@oasisprotocol/sapphire-contracts) ![npm](https://img.shields.io/npm/v/@oasisprotocol/sapphire-contracts)

**A library for privacy focused smart contract development.**

 * Implementations of OPL smart contracts
 * Sapphire library precompiles and cryptographic primitives
 * Wrapped Rose example

## Overview

#### Installation

```solidity
$ pnpm install @oasisprotocol/sapphire-contracts
```

#### Usage

Once installed, you can import and use the Sapphire contracts as follows.

```solidity
pragma solidity ^0.8.13;

import "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

contract RandomNumber {
  function generateNumber() public view returns (uint) {
    return uint(bytes32(Sapphire.randomBytes(32, "")));
  }
}
```

## Documentation

See the user's guide for [Sapphire](https://docs.oasis.io/dapp/sapphire/) and
[OPL](https://docs.oasis.io/dapp/opl/).

API reference is available at [api.docs.oasis.io](https://api.docs.oasis.io/sol/sapphire-contracts).

## Contribute

There are many ways you can participate and help build high quality software.
Check out the [contribution guide](https://github.com/oasisprotocol/sapphire-paratime/blob/main/CONTRIBUTING.md)!
