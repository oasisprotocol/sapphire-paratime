// SPDX-License-Identifier: Apache-2.0

export const CHAIN_ID = 0x5afe;

import { EIP2696_EthereumProvider, OASIS_CALL_DATA_PUBLIC_KEY, hexlify } from '@oasisprotocol/sapphire-paratime';
import nacl from 'tweetnacl';

export class MockEIP1193Provider {
    public readonly request: jest.Mock<
      Promise<unknown>,
      Parameters<EIP2696_EthereumProvider['request']>
    >;

    private calldatakeypair: nacl.BoxKeyPair;

    public get calldatapublickey() {
      return this.calldatakeypair.publicKey;
    }

    public __cycleKey() {
      this.calldatakeypair = nacl.sign.keyPair();
    }

    public constructor(public chainId: number) {
      this.calldatakeypair = nacl.sign.keyPair();
      this.request = jest.fn(async ({ method, params }) => {
        if (method === OASIS_CALL_DATA_PUBLIC_KEY) {
          const signature = nacl.sign(
            this.calldatapublickey,
            this.calldatakeypair.secretKey,
          );
          return {
            key: hexlify(this.calldatapublickey),
            checksum: '0x',
            epoch: 1,
            signature: hexlify(signature),
            chainId: chainId,
          };
        }
        if (method === 'eth_chainId') {
          return chainId;
        }
        throw new Error(
          `unhandled web3 call for ${method} with params ${params}`,
        );
      });
    }
}

/**
 * This provider simulates one which disallows oasis_callDataPublicKey
 * This is similar to MetaMask, which doesn't allow arbitrary JSON-RPC calls
 */
export class MockNonRuntimePublicKeyProvider {
    public readonly request: jest.Mock<
      Promise<unknown>,
      Parameters<EIP2696_EthereumProvider['request']>
    >;

    public readonly upstream: MockEIP1193Provider;

    get calldatapublickey() {
      return this.upstream.calldatapublickey;
    }

    public constructor(public chainId: number) {
      this.upstream = new MockEIP1193Provider(chainId);
      this.request = jest.fn((args) => {
        // Always errors while requesting the calldata public key
        // This simulates, e.g. MetaMask, which doesn't allow arbitrary requests
        if (args.method === OASIS_CALL_DATA_PUBLIC_KEY) {
          throw new Error(`unhandled web3 call`);
        }
        return this.upstream.request(args);
      });
    }
}
