# Hardhat boilerplate for Sapphire

This example contains minimal changes to the [Hardhat boilerplate code]
required to support the Oasis Sapphire ParaTime. It contains the `Token` ERC-20
smart contract and a simple react-based frontend for calling encrypted
`transfer` method.

## Quick start on Testnet

This example is part of the sapphire-paratime monorepo which uses `pnpm` to
manage dependencies. Install them by running in this folder:

```sh
pnpm install
```

You will need some TEST tokens in order to deploy the smart contract. Head to
https://faucet.testnet.oasis.io/ and request some.

Next, run this to deploy your contract on Sapphire Testnet:

```sh
PRIVATE_KEY=your_sapphire_private_key_in_hex npx hardhat run scripts/deploy.js --network sapphire-testnet
```

Finally, run the frontend with:

```sh
cd frontend
pnpm start
```

Open [http://localhost:3000/](http://localhost:3000/) in a browser to see your
dApp. You will need to have [Metamask](https://metamask.io) installed and
connected to `https://testnet.sapphire.oasis.io/` endpoint with chain ID
`23295`.

[Hardhat boilerplate code]: https://hardhat.org/tutorial
