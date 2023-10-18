// SPDX-License-Identifier: Apache-2.0

import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import * as sapphire from '@oasisprotocol/sapphire-paratime';
import { EIP155Tests__factory } from '../typechain-types/factories/contracts/tests';
import { EIP155Tests } from '../typechain-types/contracts/tests/EIP155Tests';
import { HardhatNetworkHDAccountsConfig } from 'hardhat/types';

const EXPECTED_EVENT =
  '0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

const EXPECTED_ENTROPY_ENCRYPTED = 3.8;

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

function getWallet(index: number) {
  const accounts = hre.network.config
    .accounts as HardhatNetworkHDAccountsConfig;
  if( ! accounts.mnemonic ) {
    return new ethers.Wallet((accounts as unknown as string[])[0]);
  }
  return ethers.Wallet.fromMnemonic(
    accounts.mnemonic,
    accounts.path + `/${index}`,
  );
}

describe('EIP-155', function () {
  let testContract: EIP155Tests;
  let calldata: string;
  before(async () => {
    const factory = (await ethers.getContractFactory(
      'EIP155Tests',
    )) as EIP155Tests__factory;
    testContract = await factory.deploy({
      value: ethers.utils.parseEther('1'),
    });
    await testContract.deployed();
    calldata = testContract.interface.encodeFunctionData('example');
  });

  it('Has correct block.chainid', async () => {
    const provider = testContract.provider;
    const expectedChainId = (await provider.getNetwork()).chainId;

    // Emitted via transaction
    const tx = await testContract.emitChainId();
    const receipt = await tx.wait();
    expect(receipt.events![0].args![0]).eq(expectedChainId);

    // Returned from view call
    const onchainChainId = await testContract.getChainId();
    expect(onchainChainId).eq(expectedChainId);
  });

  it('Wrapper encrypts self-signed transaction calldata', async function () {
    const tx = await testContract.example();
    expect(entropy(tx.data)).gte(EXPECTED_ENTROPY_ENCRYPTED);
    expect(tx.data).not.eq(calldata);
    expect(tx.data.length).eq(218);
  });

  /// Verify that contracts can sign transactions for submission with an unwrapped provider
  it('Other-Signed transaction submission via un-wrapped provider', async function () {
    const provider = testContract.provider;
    const signedTx = await testContract.sign({
      nonce: await provider.getTransactionCount(
        await testContract.publicAddr(),
      ),
      gasPrice: await provider.getGasPrice(),
      gasLimit: 250000,
      to: testContract.address,
      value: 0,
      data: '0x',
      chainId: 0,
    });

    // Submit signed transaction via plain JSON-RPC provider (avoiding sapphire.wrap)
    let plainResp = await provider.sendTransaction(signedTx);
    let receipt = await testContract.provider.waitForTransaction(
      plainResp.hash,
    );
    expect(plainResp.data).eq(calldata);
    expect(receipt.logs[0].data).equal(EXPECTED_EVENT);
  });

  /// Verify that contracts can sign transactions for submission with a wrapped provider
  /// Transactions signed by other accounts should pass-through the wrapped provider
  it('Other-Signed transaction submission via wrapped provider', async function () {
    const provider = testContract.provider;
    const signedTx = await testContract.sign({
      nonce: await provider.getTransactionCount(
        await testContract.publicAddr(),
      ),
      gasPrice: await provider.getGasPrice(),
      gasLimit: 250000,
      to: testContract.address,
      value: 0,
      data: '0x',
      chainId: 0,
    });

    let plainResp = await provider.sendTransaction(signedTx);
    let receipt = await provider.waitForTransaction(plainResp.hash);
    expect(plainResp.data).eq(calldata);
    expect(receipt.logs[0].data).equal(EXPECTED_EVENT);
  });

  /// Verify that the wrapped wallet will encrypt a manually signed transaction
  it('Self-Signed transaction submission via wrapped wallet', async function () {
    const provider = testContract.provider;
    const wallet = sapphire.wrap(getWallet(0).connect(provider));

    const signedTx = await wallet.signTransaction({
      gasLimit: 250000,
      to: testContract.address,
      value: 0,
      data: calldata,
      chainId: (await provider.getNetwork()).chainId,
      gasPrice: await provider.getGasPrice(),
      nonce: await provider.getTransactionCount(wallet.address),
    });

    // Calldata should be encrypted when we wrap the wallet provider
    let x = await provider.sendTransaction(signedTx);
    expect(entropy(x.data)).gte(EXPECTED_ENTROPY_ENCRYPTED);
    expect(x.data).not.eq(calldata);

    let r = await provider.waitForTransaction(x.hash);
    expect(r.logs[0].data).equal(EXPECTED_EVENT);
  });
});
