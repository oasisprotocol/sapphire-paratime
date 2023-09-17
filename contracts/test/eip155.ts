// SPDX-License-Identifier: Apache-2.0

import { expect } from 'chai';
import { ethers } from 'hardhat';
import { EIP155Tests__factory } from '../typechain-types/factories/contracts/tests';
import { EIP155Tests } from '../typechain-types/contracts/tests/EIP155Tests';

// Shannon entropy
function entropy(str: string) {
  return [...new Set(str)]
    .map((chr) => {
      return str.match(new RegExp(chr, 'g'))!.length;
    })
    .reduce((sum, frequency) => {
      let p = frequency / str.length;
      return sum + p * Math.log2(1 / p);
    }, 0);
}

describe('EIP-155', function () {
  let testContract: EIP155Tests;
  before(async () => {
    const factory = (await ethers.getContractFactory(
      'EIP155Tests',
    )) as EIP155Tests__factory;
    testContract = await factory.deploy({
      value: ethers.utils.parseEther('1'),
    });
    await testContract.deployed();
  });

  it('Wrapper encrypts transaction calldata', async function () {
    const tx = await testContract.example();
    expect(entropy(tx.data)).gte(3.8);
    expect(tx.data).not.eq(
      testContract.interface.encodeFunctionData('example'),
    );
    expect(tx.data.length).eq(218);
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
    expect(plainResp.data).eq(
      testContract.interface.encodeFunctionData('example'),
    );
    expect(receipt.logs[0].data).equal(
      '0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
    );
  });
});
