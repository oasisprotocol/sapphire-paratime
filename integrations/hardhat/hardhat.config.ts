import { HardhatUserConfig } from 'hardhat/config';
import {
  sapphireLocalnet,
  sapphireMainnet,
  sapphireTestnet,
} from './src/index';
import '@nomicfoundation/hardhat-ignition-ethers';
import '@nomicfoundation/hardhat-toolbox';

const TEST_HDWALLET = {
  mnemonic: 'test test test test test test test test test test test junk',
  path: "m/44'/60'/0'/0",
  initialIndex: 0,
  count: 20,
  passphrase: '',
};
const accounts = process.env.PRIVATE_KEY
  ? [process.env.PRIVATE_KEY]
  : TEST_HDWALLET;

const config: HardhatUserConfig = {
  networks: {
    sapphire: { ...sapphireMainnet, accounts },
    'sapphire-testnet': { ...sapphireTestnet, accounts },
    'sapphire-localnet': { ...sapphireLocalnet, accounts },
    'sapphire-localnet-proxy': {
      ...sapphireLocalnet,
      accounts,
      url: 'http://localhost:3001',
    },
  },
  solidity: {
    version: '0.8.24',
    settings: {
      evmVersion: 'paris',
    },
  },
  mocha: {
    timeout: 120_000_000, // Sapphire Mainnet/Testnet require more time.
  },
  ignition: {
    strategyConfig: {
      create2: {
        // To learn more about salts, see the CreateX documentation
        salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
      },
    },
  },
};

export default config;
