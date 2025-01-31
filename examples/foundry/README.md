# Foundry example for Sapphire developers

This project showcases Sapphire development with Foundry. 


## Overview

Test folder contains a set of Forge tests that access precompiles 
and demonstrate sapphire-specific . 
Makefile contains build/test/clean targets.


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
- `SubcallPrecompile`: Enhanced version with CBOR parsing and 
state management for:
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
1. **Requirements**
   - Foundry:
      - `curl -L https://foundry.paradigm.xyz | bash`
      - `foundryup`
   - Rust (nightly):
      - `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
      - `rustup toolchain install nightly`
      - `rustup default nightly`
   - Make

2. **Install dependencies**
   - Run `make build` to copy the neccessary files and build rust bindings.

## Run tests
    
   Project already contains tests for all precompiles 
   (see TestSapphireContracts.t.sol)

   Steps to run:
   - Make sure you're in the `sapphire-paratime/examples/foundry` directory
   - Run forge tests `forge test -vvv`



