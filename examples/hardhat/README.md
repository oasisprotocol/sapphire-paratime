# Sample Hardhat Project

This project demonstrates a basic Hardhat use case on Sapphire. The `Vigil.sol`
contract utilizes the confidentiality of private state to conditionally reveal
a secret message.

## Usage

Hardhat is configured here with the Sapphire localnet, but you can also deploy
contracts with a wallet holding testnet tokens.

### Build

You will need to build `sapphire-paratime` and `sapphire-hardhat` in this
monorepo, or modify the `package.json` to use the latest versions of those
dependencies.

### Localnet

```shell
make build
make test
```

### Testnet

```shell
export PRIVATE_KEY=0x..
pnpm hardhat full-vigil --network sapphire-testnet
```
