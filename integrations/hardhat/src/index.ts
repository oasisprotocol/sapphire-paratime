// SPDX-License-Identifier: Apache-2.0

import {
  NETWORKS,
  wrapEthereumProvider,
} from '@oasisprotocol/sapphire-paratime';
import { extendEnvironment } from 'hardhat/config';
import { HttpNetworkUserConfig } from 'hardhat/types';

export const sapphireLocalnet = {
  url: NETWORKS.localnet.defaultGateway,
  chainId: NETWORKS.localnet.chainId,
} as const satisfies HttpNetworkUserConfig;

export const sapphireTestnet = {
  url: NETWORKS.testnet.defaultGateway,
  chainId: NETWORKS.testnet.chainId,
} as const satisfies HttpNetworkUserConfig;

export const sapphireMainnet = {
  url: NETWORKS.mainnet.defaultGateway,
  chainId: NETWORKS.mainnet.chainId,
} as const satisfies HttpNetworkUserConfig;

extendEnvironment((hre) => {
  const { chainId } = hre.network.config;
  const rpcUrl = 'url' in hre.network.config ? hre.network.config.url : '';
  if (chainId) {
    if (!NETWORKS[chainId]) return;
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
  hre.network.provider = wrapEthereumProvider(hre.network.provider);
});
