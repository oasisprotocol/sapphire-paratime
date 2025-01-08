// SPDX-License-Identifier: Apache-2.0

import {
  hexlify,
  fetchRuntimePublicKey,
  NETWORKS,
  KeyFetcher,
  CallDataPublicKey,
  getBytes,
  verifyRuntimePublicKey,
} from '@oasisprotocol/sapphire-paratime';

import { encode as cborEncode, decode as cborDecode } from 'cborg';
import { MockEIP1193Provider, MockNonRuntimePublicKeyProvider } from './utils';
import { AbiCoder } from 'ethers';
import { JsonRpcProvider } from 'ethers';
import { SUBCALL_ADDR } from '../src/constants';

describe('fetchRuntimePublicKey', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('Verify runtime public key without epoch', async () => {
    const x: CallDataPublicKey = {
      public_key: {
        key: getBytes(
          '0xaa371525c094be908740c729844dae670ba8688076b7f73f2a56477b7225b96f',
        ),
        checksum: new Uint8Array(32).fill(2),
        expiration: undefined,
        signature: getBytes(
          '0x401034412210ba402f040c3d7753be3080769ef6ae53a7e8dd017fc144f6797be632a6dab834a771554535074b75da0da5c93f3bdf01c7209520b65406c4fb0f',
        ),
      },
      epoch: undefined,
      runtime_id: new Uint8Array(32).fill(3),
      key_pair_id: new Uint8Array(32).fill(4)
    };
    const signer = getBytes(
      '0xb8f0cae2ea75374e6ffc8d597e76743613828b7b17a3d890eff358486b2bbf2a',
    );

    expect(verifyRuntimePublicKey(signer, x)).toEqual(
      true,
    );
  });

  it('Verify runtime public key with epoch', async () => {
    const cdpk: CallDataPublicKey = {
      public_key: {
        key: getBytes(
          '0xaa371525c094be908740c729844dae670ba8688076b7f73f2a56477b7225b96f',
        ),
        checksum: new Uint8Array(32).fill(2),
        expiration: 0x14n,
        signature: getBytes(
          '0x6e37fcbff7f9b46b4873b314000e21c71f1f40acd97be6d2d0894f0111865ba13a13be5779313401a017b6f2cb669e980beb5d04f53a2aac1b2ca58b4f76400e',
        ),
      },
      epoch: 0xan,
      runtime_id: new Uint8Array(32).fill(3),
      key_pair_id: new Uint8Array(32).fill(4)
    };
    const signer = getBytes(
      '0xb8f0cae2ea75374e6ffc8d597e76743613828b7b17a3d890eff358486b2bbf2a',
    );

    expect(verifyRuntimePublicKey(signer, cdpk)).toEqual(
      true,
    );
  });

  /// Verifies call data public key fetching works
  it('mock provider', async () => {
    const upstream = new MockEIP1193Provider(NETWORKS.localnet.chainId);

    const cdpk = await fetchRuntimePublicKey({ upstream });
    expect(hexlify(cdpk.public_key.key)).toEqual(
      hexlify(upstream.calldatapublickey),
    );
  });

  // The mock provider rejects oasis_callDataPublicKey calls
  // This simulates, e.g. MetaMask, which doesn't allow arbitrary requests
  // It is expected that the public key will be retrieved
  it('non public key provider', async () => {
    const upstream = new MockNonRuntimePublicKeyProvider(
      NETWORKS.localnet.chainId,
    );
    const cdpk = await fetchRuntimePublicKey({ upstream });
    // This will have retrieved the key from testnet or mainnet
    expect(cdpk.public_key.key).not.toEqual(
      new Uint8Array(Buffer.alloc(32, 8)),
    );
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

    expect(pkMainnet.public_key.key).not.toBe(pkTestnet.public_key.key);
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
    expect(hexlify(pk.public_key.key)).toBe(
      hexlify(upstream.calldatapublickey),
    );
    expect(k.cipherSync()).toBe;

    // Then, after cycling the key, the fetcher should return the cached key
    upstream.__cycleKey();
    const pk2 = await k.fetch(upstream);
    expect(hexlify(pk2.public_key.key)).toBe(hexlify(oldPk));
    expect(hexlify(pk2.public_key.key)).not.toBe(
      hexlify(upstream.calldatapublickey),
    );
  });

  it('Validate core.KeyManagerPublicKey + core.CallDataPublicKey', async () => {
    const rpc = new JsonRpcProvider('http://localhost:8545');
    const coder = AbiCoder.defaultAbiCoder();

    // Retrieve KeyManager info required to verify calldata public key
    const kmpk_result = coder.decode(['uint','bytes'], await rpc.call({
      to: SUBCALL_ADDR,
      data: coder.encode(['string', 'bytes'], ['core.KeyManagerPublicKey', cborEncode(null)])
    }));
    expect(kmpk_result[0]).toEqual(0n);
    const kmpk = cborDecode(getBytes(kmpk_result[1])) as Uint8Array;
    expect(kmpk.length).toEqual(32);

    // Retrieve the calldata public key
    const cdpk_result = coder.decode(['uint','bytes'], await rpc.call({
      to: SUBCALL_ADDR,
      data: coder.encode(['string', 'bytes'], ['core.CallDataPublicKey', cborEncode(null)])
    }));
    expect(cdpk_result[0]).toEqual(0n);
    const cdpk = cborDecode(getBytes(cdpk_result[1])) as CallDataPublicKey;

    // Validate the calldata public key signature
    const cdpkIsValid = verifyRuntimePublicKey(kmpk, cdpk);
    expect(cdpkIsValid).toEqual(true);

    // Changing any of the params will invalidate the signature
    kmpk[1] = 0x3;
    const cdpkIsInvalid = verifyRuntimePublicKey(kmpk, cdpk);
    expect(cdpkIsInvalid).toEqual(false);
  });
});
