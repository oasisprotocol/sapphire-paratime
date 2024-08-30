// SPDX-License-Identifier: Apache-2.0

import {
  EIP2696_EthereumProvider,
  hexlify,
} from '@oasisprotocol/sapphire-paratime';
import { SUBCALL_ADDR, CALLDATAPUBLICKEY_CALLDATA } from '../src/constants';
import { encode as cborEncode } from 'cborg';
import nacl from 'tweetnacl';
import { AbiCoder } from 'ethers';

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
      // Intercept calls to the `core.CallDataPublicKey` subcall
      if (
        method === 'eth_call' &&
        Array.isArray(params) &&
        params[0].to === SUBCALL_ADDR &&
        params[0].data === CALLDATAPUBLICKEY_CALLDATA
      ) {
        const signature = nacl.sign(
          this.calldatapublickey,
          this.calldatakeypair.secretKey,
        );
        const coder = AbiCoder.defaultAbiCoder();
        const response = cborEncode({
          epoch: 1,
          public_key: {
            key: hexlify(this.calldatapublickey),
            checksum: '0x',
            epoch: 1,
            signature: hexlify(signature),
          },
        });
        return hexlify(coder.encode(['uint', 'bytes'], [0n, response]));
      } else if (method === 'eth_chainId') {
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
      return this.upstream.request(args);
    });
  }
}
