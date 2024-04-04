import hre from "hardhat";
import { expect } from 'chai';
import { Example$Type } from "../artifacts/contracts/Example.sol/Example";
import { GetContractReturnType, KeyedClient, PublicClient, WalletClient } from "@nomicfoundation/hardhat-viem/types";
import { sapphireLocalnet, sapphireTransport, wrapWalletClient } from '@oasisprotocol/sapphire-viem-v2';
import { createWalletClient, zeroAddress } from "viem";
import { mnemonicToAccount } from 'viem/accounts';

describe('Example Tests', () => {
    let example : GetContractReturnType<Example$Type["abi"]>;
    let publicClient : PublicClient;
    let keyedClient : KeyedClient
    let walletClient : WalletClient;

    before(async () => {
        publicClient = await hre.viem.getPublicClient({
            chain: sapphireLocalnet,
            transport: sapphireTransport()
        });
        const account = mnemonicToAccount('test test test test test test test test test test test junk');
        walletClient = await wrapWalletClient(createWalletClient({
            account: account,
            chain: sapphireLocalnet,
            transport: sapphireTransport()
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

        const tx = await publicClient.getTransaction({hash: receipt.transactionHash});
        console.log('tx', tx);
        // TODO: verify transaction is encrypted

        const sender = await example.read.getMsGSender()
        expect(sender).eq(zeroAddress);

        const owner = await example.read.getOwner();
        expect(owner).eq(keyedClient.wallet?.account.address);
    });
});
