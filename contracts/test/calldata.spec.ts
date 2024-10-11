// SPDX-License-Identifier: Apache-2.0

import { expect } from 'chai';
import { ethers } from 'hardhat';
import { TestCalldataEncryption } from '../typechain-types/contracts/tests';
import {
  boxKeyPairFromSecretKey,
  crypto_box_SECRETKEYBYTES,
  X25519DeoxysII,
} from '@oasisprotocol/sapphire-paratime';
import { hexlify, randomBytes } from 'ethers';
import { randomInt } from 'crypto';

describe('CalldataEncryption', () => {
  let contract: TestCalldataEncryption;

  before(async () => {
    const factory = await ethers.getContractFactory('TestCalldataEncryption');
    contract = await factory.deploy();
    await contract.waitForDeployment();
  });

  // Ensures that the JS library provides the same results as Solidity
  it('TestEncryptInner', async () => {
    for (let i = 1; i < 1024; i += 1 + i / 5) {
      const peerKeypair = boxKeyPairFromSecretKey(
        randomBytes(crypto_box_SECRETKEYBYTES),
      );
      const myKeypair = boxKeyPairFromSecretKey(
        randomBytes(crypto_box_SECRETKEYBYTES),
      );
      const calldata = randomBytes(i);
      const epoch = randomInt(1 << 32);
      const nonce = randomBytes(15);
      const cipher = X25519DeoxysII.fromSecretKey(
        myKeypair.secretKey,
        peerKeypair.publicKey,
        epoch,
      );
      const encryptedCall = cipher.encryptCall(calldata, nonce);
      const result = await contract.testEncryptInner(
        calldata,
        myKeypair.publicKey,
        myKeypair.secretKey,
        nonce,
        epoch,
        peerKeypair.publicKey,
      );
      expect(result).eq(hexlify(encryptedCall));
    }
  });
});
