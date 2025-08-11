import 'dotenv/config';
import '@oasisprotocol/sapphire-hardhat';
import '@nomicfoundation/hardhat-toolbox';
import '@typechain/hardhat';
import { HardhatUserConfig } from 'hardhat/config';

// custom tasks
import './tasks/deploy';
import './tasks/deploy-ecdh';
import './tasks/enc';

const PRIVATE_KEY = process.env.PRIVATE_KEY ?? '';

// Use the standard test mnemonic when no explicit private key is provided,
// just like our other examples. This ensures we always have signers available
// on remote HTTP networks (e.g., sapphire-localnet) in CI and local dev.
const accounts = PRIVATE_KEY
  ? [PRIVATE_KEY]
  : {
      mnemonic: 'test test test test test test test test test test test junk',
      path: "m/44'/60'/0'/0",
      initialIndex: 0,
      count: 20,
      passphrase: '',
    };

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Use Paris explicitly to avoid PUSH0 on chains that might not support Shanghai yet.
      evmVersion: 'paris',
    },
  },
  networks: {
    'sapphire-localnet': {
      url: 'http://localhost:8545',
      chainId: 0x5afd,
      accounts,
    },
    'sapphire-testnet': {
      url: 'https://testnet.sapphire.oasis.io',
      chainId: 0x5aff,
      accounts,
    },
    sapphire: {
      url: 'https://sapphire.oasis.io',
      chainId: 0x5afe,
      accounts,
    },
  },
  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6',
  },
};

export default config;
