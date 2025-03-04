# Foundry example for Sapphire developers

This project showcases Sapphire development with Foundry. 


## Overview

Test folder contains a set of Forge tests that access precompiles 
and demonstrate sapphire-specific functionality. 
Makefile contains build/test/clean targets.

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
   - Run `make build` ( Using foundry.toml ) to install dependencies and build rust bindings.

## Run tests

   Steps to run:
   - Make sure you're in the `sapphire-paratime/examples/foundry` directory
   - Run forge tests `forge test -vvv`

### A note on fuzz tests:
   Check out [fuzzing docs](https://book.getfoundry.sh/forge/fuzz-testing)


