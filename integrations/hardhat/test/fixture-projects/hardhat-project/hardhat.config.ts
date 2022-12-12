// We load the plugin here.
import { HardhatUserConfig } from 'hardhat/types';

import '../../../index.js';

const config: HardhatUserConfig = {
  solidity: '0.8.17',
  defaultNetwork: 'hardhat',
};

export default config;
