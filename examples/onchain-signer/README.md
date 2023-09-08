# On-Chain Signer

Short example to demonstrate Sapphire on-chain transaction generation and
signing.

## Compilation

Since this is a monorepo, make sure to build the following packages first:

- `@oasisprotocol/sapphire-paratime` in `clients/js` folder,
- `@oasisprotocol/contracts` in `contracts` folder,
- `@oasisprotocol/sapphire-hardhat` in `integration/hardhat` folder.

Then, execute the following to compile the contracts and the typescript tests:

```shell
pnpm install
pnpm build
```

## Testing

To run non-confidential tests on a Hardhat node, run:

```shell
pnpm test
``` 

To also run confidential tests, you need to spin up a Localnet Sapphire node.
For example in the Docker:

```shell
docker run -it -p8545:8545 -p8546:8546 ghcr.io/oasisprotocol/sapphire-dev -test-mnemonic -n 5
```

Then, let tests use the Localnet network:

```shell
pnpm run test --network sapphire-localnet
```
