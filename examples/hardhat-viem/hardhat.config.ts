import "@oasisprotocol/sapphire-hardhat";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomicfoundation/hardhat-ignition-viem";

const accounts = process.env.PRIVATE_KEY
? [process.env.PRIVATE_KEY]
: {
  mnemonic: "test test test test test test test test test test test junk",
  path: "m/44'/60'/0'/0",
  initialIndex: 0,
  count: 20,
  passphrase: "",
};

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "paris",
    },
  },
  networks: {
    sapphire: {
      url: 'https://sapphire.oasis.io',
      accounts,
      chainId: 0x5afe
    },
    'sapphire-testnet': {
      url: 'https://testnet.sapphire.oasis.io',
      accounts,
      chainId: 0x5aff
    },
    'sapphire-localnet': {
      url: 'http://localhost:3001',
      accounts,
      chainId: 0x5afd
    },
    'sapphire-localnet-proxy': {
      url: 'http://localhost:3001',
      accounts,
      chainId: 0x5afd
    },
  },
  mocha: {
    timeout: 20_000,
  },
};

export default config;
