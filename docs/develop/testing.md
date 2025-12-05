---
description: Testing contracts on Oasis Sapphire 
---

# Testing

While Sapphire is EVM-compatible and you can use most EVM tools to build your
dApp, but to test the confidential features you'll need to deploy and run the
test on a network which supports it.

Recommended networks for testing:

1. Sapphire [Localnet]
2. Sapphire [Testnet]

## Local Development and Testing

When you want a quick, iterative cycle for testing, the recommended approach is
to run Sapphire on your local machine. Oasis provides a Docker container that
simulates a local Sapphire blockchain—similar in spirit to a Hardhat Node or
Ganache. This makes it easy to:

- Spin up and tear down a local environment on-demand.
- Interact with a local instance of the Sapphire ParaTime.
- Debug your contracts thoroughly before heading to a live network.

For details on setting up and running this local environment, check out the
[Localnet] documentation from Oasis. It covers installation, configuration, and
provides example commands to help you get started.

### Localnet Hardhat Config

To use the Localnet with Hardhat, add the network as follows:

```js title="hardhat.config.ts"
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

// Example accounts script
const TEST_HDWALLET = {
  mnemonic: "test test test test test test test test test test test junk",
  path: "m/44'/60'/0'/0",
  initialIndex: 0,
  count: 20,
  passphrase: "",
};
const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : TEST_HDWALLET;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.19",
    settings: {
      evmVersion: "paris",
    },
  },
  // highlight-start
  networks: {
    "sapphire-localnet": {
      url: "http://localhost:8545", // Localnet RPC URL
      chainId: 23294,               // Sapphire Localnet chain ID
      accounts
    },
  },
  // highlight-end
};
```

Running your tests locally would then be as simple as:

```sh
npx hardhat test --network sapphire-localnet
```

## Testing Encrypted Transactions

One of Sapphire’s unique capability are encrypted transactions. To take full
advantage of this during testing, you can use following provider:

- Hardhat provider from `@oasisprotocol/sapphire-hardhat`
- Ethers provider from  `@oasisprotocol/sapphire-paratime`

This custom provider automatically encrypts transactions, allowing you to test
your contract’s confidential workflows in an environment that closely mirrors
production on Oasis Sapphire.

### Hardhat Provider

The Hardhat provider is the recommended when working in a Hardhat setup

To add the provider to your project, run:

```shell npm2yarn
  npm install -D @oasisprotocol/sapphire-hardhat
```

Next, import it in your `hardhat.config.ts` above the rest of your plugins so
that the provider gets wrapped before anything else starts to use it.

```js title="hardhat.config.ts"
// ESM
import '@oasisprotocol/sapphire-hardhat';

// CommonJS
require('@oasisprotocol/sapphire-hardhat');

/** All other plugins must go below this one! **/
```

After installation, simply write and run your tests and scripts as you normally
would—your transactions will be automatically encrypted behind the scenes and
you will see a green padlock for this transactions in the explorer.

### Ethers

To add the provider to your project, run:

```shell npm2yarn
  npm install -D @oasisprotocol/sapphire-paratime
```

Next, import the `wrap` function and wrap your ethers signer:

```js
import { wrap } from "@oasisprotocol/sapphire-paratime";

const wallet = new Wallet(process.env.PRIVATE_KEY);
const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545'); // Localnet RPC URL
const wrappedSigner = wrap(wallet.connect(provider));
```

[Localnet]: https://github.com/oasisprotocol/docs/blob/main/docs/build/tools/localnet.mdx
[Testnet]: ../network.mdx
