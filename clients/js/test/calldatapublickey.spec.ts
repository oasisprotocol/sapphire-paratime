// SPDX-License-Identifier: Apache-2.0

import {
  hexlify,
  fetchRuntimePublicKey,
  OASIS_CALL_DATA_PUBLIC_KEY,
  NETWORKS,
  KeyFetcher,
} from '@oasisprotocol/sapphire-paratime';

import { MockEIP1193Provider, MockNonRuntimePublicKeyProvider } from './utils';

describe('fetchRuntimePublicKey', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  /// Verifies call data public key fetching works
  it('mock provider', async () => {
    const upstream = new MockEIP1193Provider(NETWORKS.localnet.chainId);
    await upstream.request({ method: OASIS_CALL_DATA_PUBLIC_KEY });

    const pk = await fetchRuntimePublicKey({ upstream });
    expect(hexlify(pk.key)).toEqual(hexlify(upstream.calldatapublickey));
  });

  // The mock provider rejects oasis_callDataPublicKey calls
  // This simulates, e.g. MetaMask, which doesn't allow arbitrary requests
  // It is expected that the public key will be retrieved
  it('non public key provider', async () => {
    const upstream = new MockNonRuntimePublicKeyProvider(
      NETWORKS.localnet.chainId,
    );
    const pk = await fetchRuntimePublicKey({ upstream });
    // This will have retrieved the key from testnet or mainnet
    expect(pk.key).not.toEqual(new Uint8Array(Buffer.alloc(32, 8)));
  });

  // Verifies that we can differentiate between testnet & mainnet
  it('Fetches from different chainIds', async () => {
    const upstreamMainnet = new MockNonRuntimePublicKeyProvider(
      NETWORKS.mainnet.chainId,
    );
    const upstreamTestnet = new MockNonRuntimePublicKeyProvider(
      NETWORKS.testnet.chainId,
    );

    const pkMainnet = await fetchRuntimePublicKey({
      upstream: upstreamMainnet,
    });
    const pkTestnet = await fetchRuntimePublicKey({
      upstream: upstreamTestnet,
    });

    expect(pkMainnet.chainId).toEqual(upstreamMainnet.chainId);
    expect(pkTestnet.chainId).toEqual(upstreamTestnet.chainId);

    expect(pkMainnet.key).not.toBe(pkTestnet.key);
    expect(pkMainnet).not.toBe(pkTestnet);
  });

  it('Key fetcher works', async () => {
    // Initially the fetcher has no key, and no cached keys
    const k = new KeyFetcher();
    expect(k.cipherSync.bind(k)).toThrow('No cached pubkey');

    // Verify that the key can be pulled from the fetcher
    const upstream = new MockEIP1193Provider(NETWORKS.localnet.chainId);
    const oldPk = upstream.calldatapublickey;
    const pk = await k.fetch(upstream);
    expect(hexlify(pk.key)).toBe(hexlify(upstream.calldatapublickey));
    expect(k.cipherSync()).toBe;

    // Then, after cycling the key, the fetcher should return the cached key
    upstream.__cycleKey();
    const pk2 = await k.fetch(upstream);
    expect(hexlify(pk2.key)).toBe(hexlify(oldPk));
    expect(hexlify(pk2.key)).not.toBe(hexlify(upstream.calldatapublickey));
  });
});
