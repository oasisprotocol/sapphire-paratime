require('@oasisprotocol/sapphire-hardhat');
require("@nomicfoundation/hardhat-toolbox");

// The next line is part of the sample project, you don't need it in your
// project. It imports a Hardhat task definition, that can be used for
// testing the frontend.
require("./tasks/faucet");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.9",
  networks: {
    hardhat: {
      chainId: 1337 // We set 1337 to make interacting with MetaMask simpler
    },
    sapphire: {
      url: "https://testnet.sapphire.oasis.dev",
      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY]
        : [],
      chainId: 0x5aff,
    },
  }
};
