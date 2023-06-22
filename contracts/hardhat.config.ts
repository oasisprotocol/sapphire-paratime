import { HardhatUserConfig, task } from 'hardhat/config';

import '@oasisprotocol/sapphire-hardhat';
import '@typechain/hardhat';
import '@nomicfoundation/hardhat-chai-matchers';
import 'hardhat-watcher';
import 'solidity-coverage';
import { HardhatNetworkHDAccountsUserConfig } from 'hardhat/types';

const TEST_HDWALLET: HardhatNetworkHDAccountsUserConfig = {
  mnemonic: 'test test test test test test test test test test test junk',
  path: "m/44'/60'/0'/0",
  initialIndex: 0,
  count: 20,
  passphrase: '',
};

task('wrap-rose', 'Wrap some ROSE.')
  .addParam('wroseAddr')
  .addParam('amount')
  .setAction(async (args, hre) => {
    const ethers = hre.ethers;
    const WrappedROSE = await ethers.getContractFactory('WrappedROSE');
    const wrose = WrappedROSE.attach(args.wroseAddr);
    const value = ethers.utils.parseEther(args.amount);
    const tx = await wrose.deposit({ value });
    console.log(tx.hash);
    await tx.wait();
  });

task('send-wrose', 'Transfer some wROSE')
  .addParam('wroseAddr')
  .addParam('recipient')
  .addParam('amount')
  .setAction(async (args, hre) => {
    const ethers = hre.ethers;
    const WrappedROSE = await ethers.getContractFactory('WrappedROSE');
    const wrose = WrappedROSE.attach(args.wroseAddr);
    const tx = await wrose.transfer(args.recipient, args.amount);
    console.log(tx.hash);
    await tx.wait();
  });

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
    'sapphire-dev-ci': {
      url: 'http://sapphire-dev-ci:8545',
      chainId: 0x5afd,
      accounts: TEST_HDWALLET,
    },
    'sapphire-dev': {
      url: 'http://localhost:8545',
      chainId: 0x5afd,
      accounts: TEST_HDWALLET,
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
