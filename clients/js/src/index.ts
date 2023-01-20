/** @packageDocumentation
 * The main export of this package is {@link wrap}.
 *
 * The {@link cipher} module contains additional ciphers you may use (most notably {@link cipher.Plain}, which can be used for transparency).
 *
 * The {@link signedCalls} module contains utilities for making signed calls that allow the caller to have their address as `msg.sender` during an `eth_call`.
 */

export * as cipher from './cipher.js';
export * from './compat.js';
export * as signedCalls from './signed_calls.js';

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

export const OASIS_CALL_DATA_PUBLIC_KEY = 'oasis_callDataPublicKey';

export class CallError extends Error {
  public constructor(message: string, public readonly response: unknown) {
    super(message);
  }
}
