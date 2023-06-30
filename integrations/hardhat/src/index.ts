import * as sapphire from '@oasisprotocol/sapphire-paratime';
import { extendEnvironment, subtask } from 'hardhat/config';
import { TASK_NODE_GET_PROVIDER } from 'hardhat/builtin-tasks/task-names';
import { EthereumProvider } from 'hardhat/types';

import './type-extensions';

extendEnvironment((hre) => {
  const { chainId } = hre.network.config;
  const rpcUrl = 'url' in hre.network.config ? hre.network.config.url : '';
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

subtask(TASK_NODE_GET_PROVIDER).setAction(
  async (
    args: {
      forkBlockNumber?: number;
      forkUrl?: string;
    },
    { artifacts, config, network, userConfig },
    runSuper,
  ): Promise<EthereumProvider> => {
    const HARDHAT_NETWORK_NAME = 'hardhat';
    const { forkBlockNumber: forkBlockNumberParam, forkUrl: forkUrlParam } =
      args;
    if (
      network.name !== HARDHAT_NETWORK_NAME ||
      (network.config as any).confidential !== true
    ) {
      return runSuper();
    }

    const hardhatNetworkConfig = config.networks[HARDHAT_NETWORK_NAME];
    const { createProvider } = await import(
      '@oasislabs/hardhat/internal/core/providers/construction'
    );
    const provider = await createProvider(
      config,
      HARDHAT_NETWORK_NAME,
      artifacts,
    );

    const forkUrlConfig = hardhatNetworkConfig.forking?.url;
    const forkBlockNumberConfig = hardhatNetworkConfig.forking?.blockNumber;

    const forkUrl = forkUrlParam ?? forkUrlConfig;
    const forkBlockNumber = forkBlockNumberParam ?? forkBlockNumberConfig;

    if (forkBlockNumber || forkUrl) {
      throw new Error(
        'Sapphire forking is not yet supported. Please file an issue if you see this error!',
      );
    }

    const hardhatNetworkUserConfig =
      userConfig.networks?.[HARDHAT_NETWORK_NAME] ?? {};

    // enable logging
    await provider.request({
      method: 'hardhat_setLoggingEnabled',
      params: [hardhatNetworkUserConfig.loggingEnabled ?? true],
    });

    return provider;
  },
);
