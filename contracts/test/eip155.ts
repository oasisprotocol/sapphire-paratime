// SPDX-License-Identifier: Apache-2.0

import { expect } from 'chai';
import { ethers } from 'hardhat';
import { EIP155Tests__factory } from '../typechain-types/factories/contracts/tests';
import { EIP155Tests } from '../typechain-types/contracts/tests/EIP155Tests';

describe('EIP-155', function () {
  let testContract : EIP155Tests;
  before(async () => {
    const factory = (await ethers.getContractFactory(
      'EIP155Tests',
    )) as EIP155Tests__factory;
    testContract = await factory.deploy({
      value: ethers.utils.parseEther('1'),
    });
  });

  it('Encrypts pre-signed transactions', async function () {
    const txobj = {
      nonce: 0,
      gasPrice: await testContract.provider.getGasPrice(),
      gasLimit: 250000,
      to: testContract.address,
      value: 0,
      data: '0x',
      chainId: 0,
    };
    const signedTx = await testContract.sign(txobj);
    const response = await testContract.provider.sendTransaction(signedTx);
    const receipt = await response.wait();
    expect(receipt.logs[0].data).equal(
      '0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
    );
  });

  it('Signed transactions can be submitted', async function () {
    const txobj = {
      nonce: 0,
      gasPrice: await testContract.provider.getGasPrice(),
      gasLimit: 250000,
      to: testContract.address,
      value: 0,
      data: '0x',
      chainId: 0,
    };
    const signedTx = await testContract.sign(txobj);

    // Submit signed transaction via plain JSON-RPC provider (avoiding saphire.wrap)
    const plainProvider = new ethers.providers.StaticJsonRpcProvider(
      ethers.provider.connection,
    );
    let plainResp = await plainProvider.sendTransaction(signedTx);
    let receipt = await testContract.provider.waitForTransaction(
      plainResp.hash,
    );
    expect(receipt.logs[0].data).equal(
      '0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
    );
  });
});
