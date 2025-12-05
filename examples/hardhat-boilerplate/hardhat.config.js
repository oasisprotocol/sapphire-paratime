const { sapphireLocalnet, sapphireTestnet, sapphireMainnet } = require('@oasisprotocol/sapphire-hardhat');
require("@nomicfoundation/hardhat-toolbox");

// The next line is part of the sample project, you don't need it in your
// project. It imports a Hardhat task definition, that can be used for
// testing the frontend.
require("./tasks/faucet");

const accounts = process.env.PRIVATE_KEY
? [process.env.PRIVATE_KEY]
: {
  mnemonic: "test test test test test test test test test test test junk",
  path: "m/44'/60'/0'/0",
  initialIndex: 0,
  count: 20,
  passphrase: "",
};

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: {
      chainId: 1337 // We set 1337 to make interacting with MetaMask simpler
    },
    sapphire: {...sapphireMainnet, accounts},
    'sapphire-testnet': {...sapphireTestnet, accounts},
    'sapphire-localnet': {...sapphireLocalnet, accounts},
  }
};
