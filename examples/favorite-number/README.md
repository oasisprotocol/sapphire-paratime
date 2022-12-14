# RNG example for Sapphire

## Quick start on Testnet

This example is part of the sapphire-paratime monorepo which uses `pnpm` to
manage dependencies. Install them by running in this folder:

```sh
pnpm install
```

You will need some TEST tokens in order to deploy the smart contract. Head to
https://faucet.testnet.oasis.dev/ and request some.

Next, run this to deploy your contract on Sapphire Testnet:

```sh
PRIVATE_KEY=your_sapphire_private_key_in_hex npx hardhat run scripts/deploy.js --network sapphire
```

After deploy.js will deploy the contract, it will also call the contract to
generate two random numbers between 0 and 999.

NOTE: Running the deployment above using the local hardhat network will produce
zero random number.
