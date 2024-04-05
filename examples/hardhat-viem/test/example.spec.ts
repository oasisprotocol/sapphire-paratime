import hre from "hardhat";
import { expect } from 'chai';
import { Example$Type } from "../artifacts/contracts/Example.sol/Example";
import { GetContractReturnType, KeyedClient, PublicClient, WalletClient } from "@nomicfoundation/hardhat-viem/types";
import { sapphireLocalnet, sapphireTransport, wrapWalletClient } from '@oasisprotocol/sapphire-viem-v2';
import { createWalletClient, zeroAddress } from "viem";
import { mnemonicToAccount } from 'viem/accounts';
import { isCalldataEnveloped } from "@oasisprotocol/sapphire-paratime";

describe('Example Tests', () => {
    let example : GetContractReturnType<Example$Type["abi"]>;
    let publicClient : PublicClient;
    let keyedClient : KeyedClient

    before(async () => {
        const transport = sapphireTransport();
        publicClient = await hre.viem.getPublicClient({
            chain: sapphireLocalnet,
            transport
        });
        const account = mnemonicToAccount('test test test test test test test test test test test junk');
        const walletClient = await wrapWalletClient(createWalletClient({
            account,
            chain: sapphireLocalnet,
            transport
        }));
        keyedClient = {
            public: publicClient,
            wallet: walletClient
        }
        example = await hre.viem.deployContract('Example', [], {client:keyedClient});
    });

    it('Sets Owner', async () => {
        const hash = await example.write.setOwner();
        const receipt = await publicClient.waitForTransactionReceipt({hash});
        expect(receipt.status).eq('success');

        // Encrypted transaction will be enveloped, rather than being 4 bytes
        const tx = await publicClient.getTransaction({hash: receipt.transactionHash});
        expect(isCalldataEnveloped(tx.input)).eq(true);

        const sender = await example.read.getMsgSender()
        expect(sender).eq(zeroAddress);

        const owner = await example.read.getOwner();
        expect(owner).eq(keyedClient.wallet?.account.address);
    });
});
