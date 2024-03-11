import { HardhatUserConfig } from 'hardhat/config';

import '@oasisprotocol/sapphire-hardhat';
import '@nomicfoundation/hardhat-ethers';
import '@typechain/hardhat';
import 'hardhat-watcher';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: {
        enabled: true,
        runs: (1 << 32) - 1,
      },
    },
  },
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
  watcher: {
    compile: {
      tasks: ['compile'],
      files: ['./contracts/'],
    },
    test: {
      tasks: ['test'],
      files: ['./contracts/', './test'],
    },
    coverage: {
      tasks: ['coverage'],
      files: ['./contracts/', './test'],
    },
  },
  mocha: {
    require: ['ts-node/register/files'],
    timeout: 20000,
  },
};

export default config;
