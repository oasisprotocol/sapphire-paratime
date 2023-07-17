// SPDX-License-Identifier: Apache-2.0

import { expect } from "chai";
import { ethers } from 'hardhat';
import { EIP155Tests__factory } from '../typechain-types/factories/contracts/tests';
import { StaticJsonRpcProvider } from "@ethersproject/providers";

describe('EIP-155', function () {
    async function deploy() {
      const factory = (await ethers.getContractFactory(
        'EIP155Tests',
      )) as EIP155Tests__factory;
      const x = await factory.deploy({value: ethers.utils.parseEther('1')});
      return { x };
    }

    it('Signed transactions can be submitted', async function () {
        const {x} = await deploy();
        const txobj = {
            nonce: 0,
            gasPrice: await x.provider.getGasPrice(),
            gasLimit: 250000,
            to: x.address,
            value: 0,
            data: "0x",
            chainId: 0
        };
        const signedTx = await x.sign(txobj);

        // Submit signed transaction via plain JSON-RPC provider (avoiding saphire.wrap)
        const plain_provider = new StaticJsonRpcProvider(ethers.provider.connection);
        let plain_resp = await plain_provider.sendTransaction(signedTx);
        let receipt = await x.provider.waitForTransaction(plain_resp.hash);
        expect(receipt.logs[0].data).equal('0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210');
    });
});