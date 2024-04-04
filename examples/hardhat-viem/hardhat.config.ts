import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";

const config: HardhatUserConfig = {
  solidity: "0.8.23",
  networks: {
    sapphire: {
      url: 'https://sapphire.oasis.io',
      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY]
        : [],
      chainId: 0x5afe
    },
    'sapphire-testnet': {
      url: 'https://testnet.sapphire.oasis.io',
      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY]
        : [],
      chainId: 0x5aff
    },
    'sapphire-localnet': {
      url: 'http://localhost:8545',
      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY]
        : [],
      chainId: 0x5afd
    },
  },
  mocha: {
    timeout: 20_000,
  },
};

export default config;
