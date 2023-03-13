import { HardhatUserConfig } from 'hardhat/config';

import '@oasisprotocol/sapphire-hardhat';
import '@typechain/hardhat';
import '@nomicfoundation/hardhat-chai-matchers';
import 'hardhat-watcher';
import 'solidity-coverage';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.9',
    settings: {
      optimizer: {
        enabled: true,
        runs: (1 << 32) - 1,
      },
      viaIR: true,
    },
  },
  networks: {
    'emerald-testnet': {
      url: 'https://testnet.emerald.oasis.dev',
      chainId: 0xa515,
      accounts: process.env.EMERALD_TESTNET_PRIVATE_KEY
        ? [process.env.EMERALD_TESTNET_PRIVATE_KEY]
        : [],
    },
    'sapphire-testnet': {
      url: 'https://testnet.sapphire.oasis.dev',
      chainId: 0x5aff,
      accounts: process.env.SAPPHIRE_TESTNET_PRIVATE_KEY
        ? [process.env.SAPPHIRE_TESTNET_PRIVATE_KEY]
        : [],
    },
    'sapphire-mainnet': {
      url: 'https://sapphire.oasis.io',
      chainId: 0x5afe,
      accounts: process.env.SAPPHIRE_MAINNET_PRIVATE_KEY
        ? [process.env.SAPPHIRE_MAINNET_PRIVATE_KEY]
        : [],
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
    timeout: 20_000,
  },
};

export default config;
