const ExampleContract = {
    "_format": "hh-sol-artifact-1",
    "contractName": "Example",
    "sourceName": "contracts/Example.sol",
    "abi": [
      {
        "inputs": [],
        "stateMutability": "nonpayable",
        "type": "constructor"
      },
      {
        "inputs": [],
        "name": "getMsgSender",
        "outputs": [
          {
            "internalType": "address",
            "name": "",
            "type": "address"
          }
        ],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [],
        "name": "getOwner",
        "outputs": [
          {
            "internalType": "address",
            "name": "",
            "type": "address"
          }
        ],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [
          {
            "internalType": "address",
            "name": "in_owner",
            "type": "address"
          }
        ],
        "name": "setOwner",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      },
      {
        "inputs": [],
        "name": "setOwner",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      }
    ],
    "bytecode": "0x608060405234801561001057600080fd5b50336000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555061032d806100606000396000f3fe608060405234801561001057600080fd5b506004361061004c5760003560e01c806313af40351461005157806340caae061461006d5780637a6ce2e114610077578063893d20e814610095575b600080fd5b61006b60048036038101906100669190610223565b6100b3565b005b610075610184565b005b61007f61018f565b60405161008c919061025f565b60405180910390f35b61009d610197565b6040516100aa919061025f565b60405180910390f35b60008054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614610141576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610138906102d7565b60405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555050565b61018d336100b3565b565b600033905090565b60008060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905090565b600080fd5b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b60006101f0826101c5565b9050919050565b610200816101e5565b811461020b57600080fd5b50565b60008135905061021d816101f7565b92915050565b600060208284031215610239576102386101c0565b5b60006102478482850161020e565b91505092915050565b610259816101e5565b82525050565b60006020820190506102746000830184610250565b92915050565b600082825260208201905092915050565b7f6e6f74206f776e65722100000000000000000000000000000000000000000000600082015250565b60006102c1600a8361027a565b91506102cc8261028b565b602082019050919050565b600060208201905081810360008301526102f0816102b4565b905091905056fea264697066735822122064054c132683c87757dc851258979272e6caa22a372ef98f307bba5326ea700664736f6c63430008180033",
    "deployedBytecode": "0x608060405234801561001057600080fd5b506004361061004c5760003560e01c806313af40351461005157806340caae061461006d5780637a6ce2e114610077578063893d20e814610095575b600080fd5b61006b60048036038101906100669190610223565b6100b3565b005b610075610184565b005b61007f61018f565b60405161008c919061025f565b60405180910390f35b61009d610197565b6040516100aa919061025f565b60405180910390f35b60008054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614610141576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610138906102d7565b60405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555050565b61018d336100b3565b565b600033905090565b60008060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905090565b600080fd5b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b60006101f0826101c5565b9050919050565b610200816101e5565b811461020b57600080fd5b50565b60008135905061021d816101f7565b92915050565b600060208284031215610239576102386101c0565b5b60006102478482850161020e565b91505092915050565b610259816101e5565b82525050565b60006020820190506102746000830184610250565b92915050565b600082825260208201905092915050565b7f6e6f74206f776e65722100000000000000000000000000000000000000000000600082015250565b60006102c1600a8361027a565b91506102cc8261028b565b602082019050919050565b600060208201905081810360008301526102f0816102b4565b905091905056fea264697066735822122064054c132683c87757dc851258979272e6caa22a372ef98f307bba5326ea700664736f6c63430008180033",
    "linkReferences": {},
    "deployedLinkReferences": {}
} as const;

import { test, expect } from 'vitest';
import { sapphireLocalnet, sapphireHttpTransport, wrapWalletClient } from '@oasisprotocol/sapphire-viem-v2';
import { createPublicClient, createWalletClient, zeroAddress, getContract } from "viem";
import { mnemonicToAccount } from 'viem/accounts';
import { isCalldataEnveloped } from "@oasisprotocol/sapphire-paratime";

test('Hardhat Sapphire+Viem Integration', {timeout:1000*10}, async function () {
    const transport = sapphireHttpTransport();
    const chain = sapphireLocalnet;
    const publicClient = createPublicClient({chain, transport});
    const account = mnemonicToAccount('test test test test test test test test test test test junk');
    const walletClient = await wrapWalletClient(createWalletClient({
        account, chain, transport
    }));

    const deployTxHash = await walletClient.deployContract({
        account,
        bytecode: ExampleContract.bytecode,
        abi: ExampleContract.abi,
    });
    const deployTxReceipt = await publicClient.waitForTransactionReceipt({hash: deployTxHash});

    const example = getContract({
        address: deployTxReceipt.contractAddress!,
        abi: ExampleContract.abi,
        client: {public: publicClient, wallet: walletClient}
    });

    const hash = await example.write.setOwner();
    const receipt = await publicClient.waitForTransactionReceipt({hash});
    expect(receipt.status).eq('success');

    // Encrypted transaction will be enveloped, rather than being 4 bytes
    const tx = await publicClient.getTransaction({hash: receipt.transactionHash});
    expect(isCalldataEnveloped(tx.input)).eq(true);

    const sender = await example.read.getMsgSender()
    expect(sender).eq(zeroAddress);
});
