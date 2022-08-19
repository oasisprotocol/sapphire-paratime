export {
  Plain as PlainCipher,
  X25519DeoxysII as X25519DeoxysIICipher,
  lazy as lazyCipher,
} from './cipher.js';
export * from './compat.js';
export * from './signed_calls.js';

const mainnetParams = {
  chainId: 0x5afe,
  defaultGateway: 'https://sapphire.oasis.dev/',
  runtimeId:
    '0x0000000000000000000000000000000000000000000000000000000000000000',
};
const testnetParams = {
  chainId: 0x5aff,
  defaultGateway: 'https://testnet.sapphire.oasis.dev/',
  runtimeId:
    '0x000000000000000000000000000000000000000000000000a6d1e3ebf60dff6c',
};
export const NETWORKS = {
  mainnet: mainnetParams,
  testnet: testnetParams,
  [mainnetParams.chainId]: mainnetParams,
  [testnetParams.chainId]: testnetParams,
};

export class CallError extends Error {
  public constructor(message: string, public readonly response: unknown) {
    super(message);
  }
}
