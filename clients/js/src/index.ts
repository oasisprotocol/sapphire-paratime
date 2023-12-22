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
export { NETWORKS } from './networks.js';

export const OASIS_CALL_DATA_PUBLIC_KEY = 'oasis_callDataPublicKey';

export class CallError extends Error {
  public constructor(message: string, public readonly response: unknown) {
    super(message);
  }
}
