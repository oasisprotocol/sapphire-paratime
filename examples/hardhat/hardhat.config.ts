// #region config-preamble
import { HardhatUserConfig, task } from "hardhat/config";
import "@oasisprotocol/sapphire-hardhat";
import "@nomicfoundation/hardhat-toolbox";
import "./tasks"

// Hardhat Node and sapphire-dev test key
const firstPrivateKey = `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`;
const accounts = process.env.PRIVATE_KEY
  ? [process.env.PRIVATE_KEY]
  : [firstPrivateKey];
// #endregion config-preamble


// #region config-networks
const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    sapphire: {
      url: "https://sapphire.oasis.io",
      chainId: 0x5afe,
      accounts,
    },
    "sapphire-testnet": {
      url: "https://testnet.sapphire.oasis.io",
      accounts,
      chainId: 0x5aff,
    },
    "sapphire-localnet": {
      // docker run -it -p8544-8548:8544-8548 ghcr.io/oasisprotocol/sapphire-localnet
      url: "http://localhost:8545",
      chainId: 0x5afd,
      accounts,
    },
  },
};
// #endregion config-networks

export default config;
