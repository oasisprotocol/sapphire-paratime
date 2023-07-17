// SPDX-License-Identifier: Apache-2.0

import { expect } from 'chai';
import { ethers } from 'hardhat';
import { EIP155Tests__factory } from '../typechain-types/factories/contracts/tests';

describe('EIP-155', function () {
  async function deploy() {
    const factory = (await ethers.getContractFactory(
      'EIP155Tests',
    )) as EIP155Tests__factory;
    const testContract = await factory.deploy({
      value: ethers.utils.parseEther('1'),
    });
    return { testContract };
  }

  it('Signed transactions can be submitted', async function () {
    const { testContract } = await deploy();
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
