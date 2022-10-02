import { HardhatUserConfig } from 'hardhat/config';

import '@oasisprotocol/sapphire-hardhat';
import '@nomiclabs/hardhat-ethers';
import '@typechain/hardhat';
import 'hardhat-watcher';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.16',
    settings: {
      optimizer: {
        enabled: true,
        runs: (1 << 32) - 1,
      },
    },
  },
  networks: {
    'emerald-testnet': {
      url: 'https://testnet.emerald.oasis.dev',
      accounts: process.env.EMERALD_TESTNET_PRIVATE_KEY
        ? [process.env.EMERALD_TESTNET_PRIVATE_KEY]
        : [],
    },
    'sapphire-testnet': {
      url: 'https://testnet.sapphire.oasis.dev',
      accounts: process.env.SAPPHIRE_TESTNET_PRIVATE_KEY
        ? [process.env.SAPPHIRE_TESTNET_PRIVATE_KEY]
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
    timeout: 20000,
  },
};

export default config;
