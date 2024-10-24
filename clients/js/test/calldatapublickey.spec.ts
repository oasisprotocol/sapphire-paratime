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
    };
    const signer = getBytes(
      '0xb8f0cae2ea75374e6ffc8d597e76743613828b7b17a3d890eff358486b2bbf2a',
    );
    const runtime_id = new Uint8Array(32).fill(3);
    const key_pair_id = new Uint8Array(32).fill(4);

    expect(verifyRuntimePublicKey(signer, x, runtime_id, key_pair_id)).toEqual(
      true,
    );
  });

  it('Verify runtime public key with epoch', async () => {
    const x: CallDataPublicKey = {
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
    };
    const signer = getBytes(
      '0xb8f0cae2ea75374e6ffc8d597e76743613828b7b17a3d890eff358486b2bbf2a',
    );
    const runtime_id = new Uint8Array(32).fill(3);
    const key_pair_id = new Uint8Array(32).fill(4);

    expect(verifyRuntimePublicKey(signer, x, runtime_id, key_pair_id)).toEqual(
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

  it('Dorp', async () => {
    const rpc = new JsonRpcProvider('http://localhost:8545');
    const coder = AbiCoder.defaultAbiCoder();
    const result = await rpc.call({
      to: SUBCALL_ADDR,
      data: coder.encode(['string', 'bytes'], ['core.KeyManagerPublicKey', cborEncode(null)])
    });
    const blah = coder.decode(['uint','bytes'], result);
    const raah = cborDecode(getBytes(blah[1]));
    console.log('Dorp', result, blah, raah);
  });

  /*
  it('Testnet', async () => {
    const statuses = {
      "id": "4000000000000000000000000000000000000000000000004a1a53dff2ae482d",
      "checksum": "RZkXlhoVAKGy2tn27VR2DKpkJqCY1+CG/JCdr1aSa/I=",
      "rsk": "4uh2Yw5DNr3CbLzVrfnGUTeiCpwVJb1TQSLG80yWZ9o="
    };
    const runtime_id = getBytes(statuses.id);
    const checksum = decodeBase64(statuses.checksum);
    const rsk = decodeBase64(statuses.rsk);

    const upstream = new JsonRpcProvider('https://testnet.sapphire.oasis.io');
    const cdpk = await fetchRuntimePublicKey({ upstream });
    expect(verifyRuntimePublicKey(rsk, cdpk, runtime_id, key_pair_id)).toEqual(
      true,
    );
  });

  it('Mainnet', async () => {
    const statuses = {
      "id": "4000000000000000000000000000000000000000000000008c5ea5e49b4bc9ac", // km runtime id
      "checksum": "Wd1+cYi5c2iXynGezp3ObZYY4/SHVT3MvGAbqEi2XZw=", // hash of the latest master secret
      "rsk": "ItZvPdRKJFCqcd6srqv58eGD7T8n10aLZATwejKGwUA=" // signing key derived from the latest master secret
    };
    const upstream = new JsonRpcProvider('https://sapphire.oasis.io/');
    const cdpk = await fetchRuntimePublicKey({ upstream });
    const checksum = decodeBase64(statuses.checksum);
    const rsk = decodeBase64(statuses.rsk);
  });
  */
});
