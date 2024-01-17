const mainnetParams = {
  chainId: 0x5afe,
  defaultGateway: 'https://sapphire.oasis.io/',
  runtimeId:
    '0x000000000000000000000000000000000000000000000000f80306c9858e7279',
};

const testnetParams = {
  chainId: 0x5aff,
  defaultGateway: 'https://testnet.sapphire.oasis.dev/',
  runtimeId:
    '0x000000000000000000000000000000000000000000000000a6d1e3ebf60dff6c',
};

const localnetParams = {
  chainId: 0x5afd,
  defaultGateway: 'http://localhost:8545/',
  runtimeId:
    '0x8000000000000000000000000000000000000000000000000000000000000000',
};

export const NETWORKS = {
  mainnet: mainnetParams,
  testnet: testnetParams,
  localnet: localnetParams,
  [mainnetParams.chainId]: mainnetParams,
  [testnetParams.chainId]: testnetParams,
  [localnetParams.chainId]: localnetParams,
};
