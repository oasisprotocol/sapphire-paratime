import hre from "hardhat";
import { expect } from 'chai';
import { Example$Type } from "../artifacts/contracts/Example.sol/Example";
import { GetContractReturnType, KeyedClient, PublicClient } from "@nomicfoundation/hardhat-viem/types";
import { sapphireLocalnet, sapphireHttpTransport, wrapWalletClient } from '@oasisprotocol/sapphire-viem-v2';
import { createWalletClient, zeroAddress } from "viem";
import { mnemonicToAccount } from 'viem/accounts';
import { isCalldataEnveloped } from "@oasisprotocol/sapphire-paratime";

type ExampleContractT = GetContractReturnType<Example$Type["abi"]>;

describe('Hardhat Sapphire+Viem Integration', () => {
    let example : ExampleContractT;
    let publicClient : PublicClient;
    let keyedClient : KeyedClient

    before(async () => {
        const transport = sapphireHttpTransport();
        const chain = sapphireLocalnet;
        publicClient = await hre.viem.getPublicClient({chain, transport});
        const account = mnemonicToAccount('test test test test test test test test test test test junk');
        const walletClient = await wrapWalletClient(createWalletClient({
            account, chain, transport
        }));
        keyedClient = {
            public: publicClient,
            wallet: walletClient
        }
        example = await hre.viem.deployContract('Example', [], {client:keyedClient});
    });

    it('Sets Owner with encrypted transaction', async () => {
        const hash = await example.write.setOwner();
        const receipt = await publicClient.waitForTransactionReceipt({hash});
        expect(receipt.status).eq('success');

        // Encrypted transaction will be enveloped, rather than being 4 bytes
        const tx = await publicClient.getTransaction({hash: receipt.transactionHash});
        expect(isCalldataEnveloped(tx.input)).eq(true);

        const sender = await example.read.getMsgSender()
        expect(sender).eq(zeroAddress);
    });
});
