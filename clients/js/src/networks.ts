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
  chainId: 0x5afd,
  defaultGateway: `http://${SAPPHIRE_LOCALNET_HTTP_PROXY_HOST}:${SAPPHIRE_LOCALNET_HTTP_PROXY_PORT}`,
  runtimeId:
    '0x8000000000000000000000000000000000000000000000000000000000000000',
};

const mainnetParams = {
  chainId: 0x5afe,
  defaultGateway: 'https://sapphire.oasis.io/',
  runtimeId:
    '0x000000000000000000000000000000000000000000000000f80306c9858e7279',
};

const testnetParams = {
  chainId: 0x5aff,
  defaultGateway: 'https://testnet.sapphire.oasis.io/',
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
