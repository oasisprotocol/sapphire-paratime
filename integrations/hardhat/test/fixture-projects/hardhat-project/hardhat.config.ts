// We load the plugin here.
import { HardhatUserConfig } from 'hardhat/types';

import '@nomiclabs/hardhat-ethers';
import '@nomicfoundation/hardhat-chai-matchers';

import '../../../src/index';

const config: HardhatUserConfig = {
  solidity: '0.8.17',
  networks: {
    hardhat: {
      confidential: true,
    }
  }
};

export default config;
