# Foundry Package for Sapphire developers

This project implements Sapphire-compatible precompiles 
for use with forge tests. It includes support for 
confidential computing capabilities through encryption/decryption handling.

## Overview

This project contains a set of contracts that mock Sapphire's precompile 
behavior using rust bindings. In addition, it contains SapphireDecryptor, 
a contract that can decrypt encrypted calldata. SapphireDecryptor works by 
inheritence and will forward the decrypted calldata to the contract that 
called it. This is useful, for example, to test the execution of the on-chain 
generated gasless transactions with encrypted calldata.

## List of precompiles

### Cryptographic Operations

- `RandomBytes`: Generate random bytes
- `X25519Derive`: Derive shared secrets using X25519
- `DeoxysiiSeal`: Encrypt data using Deoxys-II
- `DeoxysiiOpen`: Decrypt data using Deoxys-II
- `Curve25519ComputePublic`: Compute public keys
- `DECODE`: decode cbor encoded data and decrypt the calldata. 
**Warning**: This precompile is not part of 
the Sapphire EVM. It is only used for
testing encryption envelope without having to decode the CBOR encoded data 
in solidity tests.


### Key Management
- `KeypairGenerate`: Generate cryptographic keypairs
- `Sign`: Sign messages
- `Verify`: Verify signatures

### Consensus Operations
- `Subcall`: Enhanced version with CBOR parsing and state management for:
- Delegations
- Undelegations
- Receipt tracking

## Key Features

1. **Sapphire precompiles as contracts**
   - Can run as native precompiles
   - Easy import into forge tests

2. **Decryption Base contract**
   - Enables decryption at contract level
   - Used as a base contract for other contracts that implement encryption

## Installation

This folder contains precompile contracts and rust bindings that can be 
imported into separate Foundry projects. 
To install the dependencies, run `make build` ( Using foundry.toml ).


## Usage
To test the precompiles, run `forge test`.

For a test example, see [sapphire-paratime/examples/foundry].
[sapphire-paratime/examples/foundry]: https://github.com/oasisprotocol/sapphire-paratime/tree/main/examples/foundry


