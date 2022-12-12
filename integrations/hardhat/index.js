const sapphire = require('@oasisprotocol/sapphire-paratime');
const { extendEnvironment } = require('hardhat/config');
require('@nomiclabs/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');

extendEnvironment((hre) => {
  const { chainId, url: rpcUrl } = hre.network.config;
  if (chainId) {
    if (!sapphire.NETWORKS[chainId]) return;
  } else {
    if (!/sapphire/i.test(rpcUrl)) return;

    console.warn(
      'The Hardhat config for the network with `url`',
      rpcUrl,
      'did not specify `chainId`.',
      'The RPC URL looks like it may be Sapphire, so `@oasisprotocol/sapphire-hardhat` has been activated.',
      'You can prevent this from happening by setting a non-Sapphire `chainId`.',
    );
  }
  hre.network.provider = sapphire.wrap(hre.network.provider);
});
