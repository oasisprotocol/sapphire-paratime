declare let process: {
  env: {
    SAPPHIRE_LOCALNET_HTTP_PROXY_PORT?: string;
    SAPPHIRE_LOCALNET_HTTP_PROXY_HOST?: string;
  };
};

/**
 * This environment variable allows for the sapphire-localnet port to be
 * overridden via the command-line. This is useful for debugging with a proxy.
 *
 * Note: this will fail gracefully in-browser
 */
export const SAPPHIRE_LOCALNET_HTTP_PROXY_PORT = globalThis.process?.env
  ?.SAPPHIRE_LOCALNET_HTTP_PROXY_PORT
  ? Number(process.env.SAPPHIRE_LOCALNET_HTTP_PROXY_PORT)
  : 8545;

export const SAPPHIRE_LOCALNET_HTTP_PROXY_HOST = globalThis.process?.env
  ?.SAPPHIRE_LOCALNET_HTTP_PROXY_HOST
  ? Number(process.env.SAPPHIRE_LOCALNET_HTTP_PROXY_HOST)
  : 'localhost';

const localnetParams = {
  chainName: 'Oasis Sapphire Localnet',
  chainId: 0x5afd,
  defaultGateway: `http://${SAPPHIRE_LOCALNET_HTTP_PROXY_HOST}:${SAPPHIRE_LOCALNET_HTTP_PROXY_PORT}`,
  rpcUrls: [
    `http://${SAPPHIRE_LOCALNET_HTTP_PROXY_HOST}:${SAPPHIRE_LOCALNET_HTTP_PROXY_PORT}`,
  ],
  nativeCurrency: {
    name: 'Oasis TEST',
    symbol: 'TEST',
    decimals: 18,
  },
  blockExplorerUrls: ['http://localhost:8548/localnet/sapphire'],
  runtimeId:
    '0x8000000000000000000000000000000000000000000000000000000000000000',
};

const mainnetParams = {
  chainName: 'Oasis Sapphire',
  chainId: 0x5afe,
  defaultGateway: 'https://sapphire.oasis.io/',
  rpcUrls: ['https://sapphire.oasis.io/'],
  nativeCurrency: {
    name: 'Oasis ROSE',
    symbol: 'ROSE',
    decimals: 18,
  },
  blockExplorerUrls: ['https://explorer.oasis.io/mainnet/sapphire'],
  iconUrls: ['https://assets.oasis.io/logotypes/metamask-oasis-sapphire.png'],
  runtimeId:
    '0x000000000000000000000000000000000000000000000000f80306c9858e7279',
};

const testnetParams = {
  chainName: 'Oasis Sapphire Testnet',
  chainId: 0x5aff,
  defaultGateway: 'https://testnet.sapphire.oasis.io/',
  rpcUrls: ['https://testnet.sapphire.oasis.io/'],
  nativeCurrency: {
    name: 'Oasis TEST',
    symbol: 'TEST',
    decimals: 18,
  },
  blockExplorerUrls: ['https://explorer.oasis.io/testnet/sapphire'],
  iconUrls: [
    'https://assets.oasis.io/logotypes/metamask-oasis-sapphire-testnet.png',
  ],
  runtimeId:
    '0x000000000000000000000000000000000000000000000000a6d1e3ebf60dff6c',
};

export const NETWORKS = {
  mainnet: mainnetParams,
  testnet: testnetParams,
  localnet: localnetParams,
  [mainnetParams.chainId]: mainnetParams,
  [testnetParams.chainId]: testnetParams,
  [localnetParams.chainId]: localnetParams,
};
