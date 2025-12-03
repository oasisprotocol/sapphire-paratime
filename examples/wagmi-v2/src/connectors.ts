import type { Connector } from "wagmi";

/**
 * Wrap a Wagmi connector with Sapphire-specific logic.
 * Minimal implementation for now.
 */
export function wrapConnectorWithSapphire<T extends Connector>(
  connector: T,
  _options?: { id?: string; name?: string }
): T {
  return connector;
}
