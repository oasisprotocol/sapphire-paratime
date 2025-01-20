# Foundry Package for Sapphire developers

This project implements Sapphire-compatible precompiles for use with forge tests. It includes support for confidential computing capabilities through encryption/decryption handling.

## Overview

This project contains a set of contracts that mock Sapphire's precompile behavior using rust bindings. 
In addition, it contains SapphireDecryptor, a contract that can decrypt encrypted calldata. 
SapphireDecryptor works by inheritence and will forward the decrypted calldata to the contract that called it. 
This is useful for testing gasless transactions which contain encrypted calldata.

The project provides several key precompiles:

### Cryptographic Operations
- `RandomBytesPrecompile`: Generate random bytes
- `X25519DerivePrecompile`: Derive shared secrets using X25519
- `DeoxysiiSealPrecompile`: Encrypt data using Deoxys-II
- `DeoxysiiOpenPrecompile`: Decrypt data using Deoxys-II
- `Curve25519ComputePublicPrecompile`: Compute public keys

### Key Management
- `KeypairGeneratePrecompile`: Generate cryptographic keypairs
- `SignPrecompile`: Sign messages
- `VerifyPrecompile`: Verify signatures

### Consensus Operations
- `SubcallPrecompile`: Enhanced version with CBOR parsing and state management for:
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
1. **Install dependencies**
    - `forge install foundry-rs/forge-std --no-commit --no-git`
    - `forge install oasisprotocol/sapphire-paratime --no-commit --no-git`
    - Make sure you have rust nightly installed. Go to src/precompiles and build rust bindings:
      - `cargo +nightly build --release` (ignore warnings, this will be fixed in the future)

2. **Run tests**
    
    Project already contains tests for all precompiles (see TestSapphireContracts.t.sol)
    
    Steps to run:
    - Make sure to inherit from SapphireTest, which handles the precompile deployment
    - Run forge tests `forge test`

## Usage
For a more concise example with fuzz testing, see sapphire-paratime/examples/foundry.


