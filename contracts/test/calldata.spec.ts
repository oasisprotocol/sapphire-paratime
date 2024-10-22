// SPDX-License-Identifier: Apache-2.0

import { expect } from 'chai';
import { ethers } from 'hardhat';
import { TestCalldataEncryption } from '../typechain-types/contracts/tests';
import {
  boxKeyPairFromSecretKey,
  crypto_box_SECRETKEYBYTES,
  isCalldataEnveloped,
  X25519DeoxysII,
} from '@oasisprotocol/sapphire-paratime';
import { hexlify, parseUnits, randomBytes } from 'ethers';
import { randomInt } from 'crypto';

describe('CalldataEncryption', () => {
  let contract: TestCalldataEncryption;

  before(async () => {
    const cdeFac = await ethers.getContractFactory('CalldataEncryption');
    const cdeLib = await cdeFac.deploy();
    await cdeLib.waitForDeployment();

    const factory = await ethers.getContractFactory('TestCalldataEncryption', {
      libraries: {
        CalldataEncryption: await cdeLib.getAddress(),
      },
    });
    contract = await factory.deploy();
    await contract.waitForDeployment();
  });

  // Ensures that the JS library provides the same results as Solidity
  it('testEncryptCallData', async () => {
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
      const result = await contract.testEncryptCallData(
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

  it('roundtrip encryption', async () => {
    // Tests must be submitted from an account which has a balance
    // But can't get access to the signer private key from here
    // So, assume the 0xf39F address is being used to run tests
    const myAddr = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
    const myKey =
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const [signerAddr] = await ethers.getSigners();
    expect(signerAddr).eq(myAddr);

    for (let i = 1; i < 1024; i += 250) {
      // Have the contract sign an encrypted transaction for us
      const bytes = randomBytes(i);
      const nonce = await ethers.provider.getTransactionCount(myAddr);
      const gasPrice = parseUnits('100', 'gwei');
      const gasLimit = 200000;
      const tx = await contract.makeExampleCall(
        bytes,
        nonce,
        gasPrice,
        gasLimit,
        myAddr,
        myKey,
      );

      // Then broadcast transaction and make sure the result is given back to us
      // Making sure the tx was encrypted, and data is passed correctly
      const response = await ethers.provider.broadcastTransaction(tx);
      expect(isCalldataEnveloped(response.data)).eq(true);
      const receipt = await response.wait();
      expect(receipt?.status).eq(1);
      const parsed = contract.interface.parseLog({
        topics: receipt!.logs[0].topics as string[],
        data: receipt!.logs[0].data,
      });
      expect(parsed!.args[0]).eq(hexlify(bytes));
    }
  });
});
