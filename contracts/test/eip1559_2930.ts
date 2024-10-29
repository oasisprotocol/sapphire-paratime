import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { wrapEthersSigner } from '@oasisprotocol/sapphire-ethers-v6';
import { EIPTests__factory } from '../typechain-types/factories/contracts/tests';
import { EIPTests } from '../typechain-types/contracts/tests/EIPTests';
import { HardhatNetworkHDAccountsConfig } from 'hardhat/types';
import { Transaction } from 'ethers';

const EXPECTED_EVENT = '0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
const EXPECTED_ENTROPY_ENCRYPTED = 3.8;

// Shannon entropy calculation
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
  const accounts = hre.network.config.accounts as HardhatNetworkHDAccountsConfig;
  if (!accounts.mnemonic) {
    return new ethers.Wallet((accounts as unknown as string[])[0]);
  }
  return ethers.HDNodeWallet.fromMnemonic(
    ethers.Mnemonic.fromPhrase(accounts.mnemonic),
    accounts.path + `/${index}`,
  );
}

async function verifyTxReceipt(response: any, expectedData?: string) {
  const receipt = await response.wait();
  if (!receipt) throw new Error('No transaction receipt received');
  
  if (expectedData) {
    expect(receipt.logs[0].data).to.equal(expectedData);
  }
  return receipt;
}

describe('EIP-1559 and EIP-2930 Tests', function () {
  let testContract: EIPTests;
  let calldata: string;

  before(async () => {
    const factory = (await ethers.getContractFactory(
      'EIPTests',
    )) as unknown as EIPTests__factory;
    testContract = await factory.deploy({
      value: ethers.parseEther('10'),
    });
    await testContract.waitForDeployment();
    calldata = testContract.interface.encodeFunctionData('example');
  });

  it('Has correct block.chainid', async () => {
    const provider = ethers.provider;
    const expectedChainId = (await provider.getNetwork()).chainId;

    const tx = await testContract.emitChainId();
    const receipt = await tx.wait();
    if (!receipt || receipt.status != 1) throw new Error('tx failed');
    expect(receipt.logs![0].data).eq(expectedChainId);

    const onchainChainId = await testContract.getChainId();
    expect(onchainChainId).eq(expectedChainId);
  });

  describe('EIP-1559', function() {
    it('Other-Signed EIP-1559 transaction submission via un-wrapped provider', async function () {
      const provider = ethers.provider;
      const feeData = await provider.getFeeData();

      const publicAddr = await testContract.SENDER_ADDRESS();
      const secretKey = await testContract.SECRET_KEY();
      console.log(`Public Address: ${publicAddr}`);
      console.log(`Secret Key: ${secretKey}`);
      
      // Ensure fee data is valid
      if (!feeData.gasPrice) {
          throw new Error('Failed to fetch fee data');
        }
  
      // Set custom values for maxPriorityFeePerGas and maxFeePerGas
      const maxPriorityFeePerGas = ethers.parseUnits('20', 'gwei'); // Custom value for maxPriorityFeePerGas
      const maxFeePerGas = ethers.parseUnits('120', 'gwei'); // Custom value for maxFeePerGas

      const signedTx = await testContract.signEIP1559({
        nonce: await provider.getTransactionCount(await testContract.SENDER_ADDRESS()),
        maxPriorityFeePerGas: maxPriorityFeePerGas,
        maxFeePerGas: maxFeePerGas,
        gasLimit: 250000,
        to: await testContract.getAddress(),
        value: 0,
        data: '0x',
        accessList: { items: [] },
        chainId: 0,
      });

      let plainResp = await provider.broadcastTransaction(signedTx);
      await plainResp.wait();
      let receipt = await provider.getTransactionReceipt(plainResp.hash);
      expect(plainResp.data).eq(calldata);
      expect(receipt!.logs[0].data).equal(EXPECTED_EVENT);
    });

    it('Should compare Self-Signed EIP-1559 transactions with and without access list', async function () {
      const provider = ethers.provider;
      const privateKey = await testContract.SECRET_KEY();
      const wp = new ethers.Wallet(privateKey, provider);
      const wallet = wrapEthersSigner(wp);
      
      const maxPriorityFeePerGas = ethers.parseUnits('20', 'gwei');
      const maxFeePerGas = ethers.parseUnits('200', 'gwei');
      const contractAddress = await testContract.getAddress();
  
      // Get storage slots
      const [slot0, slot1, slot2, slot3] = await testContract.getStorageSlots();
  
      // Test cases
      const testCases = [
          {
              name: "Without access list",
              accessList: []
          },
          {
              name: "With access list",
              accessList: [
                  {
                      address: contractAddress,
                      storageKeys: [slot0, slot1, slot2, slot3]
                  }
              ]
          }
      ];
  
      for (const testCase of testCases) {
          console.log(`\nTesting: ${testCase.name}`);
          
          const tx = Transaction.from({
              gasLimit: 250000,
              to: contractAddress,
              value: 0,
              data: calldata,
              chainId: (await provider.getNetwork()).chainId,
              maxPriorityFeePerGas,
              maxFeePerGas,
              nonce: await provider.getTransactionCount(wallet.address),
              type: 2, // EIP-1559
              accessList: testCase.accessList
          });
  
          const signedTx = await wallet.signTransaction(tx);
          let response = await provider.broadcastTransaction(signedTx);
          const receipt = await verifyTxReceipt(response);
          
          console.log(`Gas used: ${receipt.gasUsed} gas`);
  
          // Verify transaction succeeded and produced expected results
          expect(entropy(response.data)).gte(EXPECTED_ENTROPY_ENCRYPTED);
          expect(response.data).not.eq(calldata);
          expect(receipt.logs[0].data).equal(EXPECTED_EVENT);
  
          // Optional: Print the decoded transaction to verify access list
          const decodedTx = Transaction.from(signedTx);
          console.log('Access List:', decodedTx.accessList);
      }
  });
  });

  describe('EIP-2930', function() {
    it('Other-Signed EIP-2930 transaction submission via un-wrapped provider', async function () {
      const provider = ethers.provider;
      const feeData = await provider.getFeeData();
      
      const signedTx = await testContract.signEIP2930({
        nonce: await provider.getTransactionCount(await testContract.SENDER_ADDRESS()),
        gasPrice: feeData.gasPrice as bigint,
        gasLimit: 250000,
        to: await testContract.getAddress(),
        value: 0,
        data: '0x',
        accessList: { items: [] },
        chainId: 0,
      });

      let plainResp = await provider.broadcastTransaction(signedTx);
      await plainResp.wait();
      let receipt = await provider.getTransactionReceipt(plainResp.hash);
      expect(plainResp.data).eq(calldata);
      expect(receipt!.logs[0].data).equal(EXPECTED_EVENT);
    });

    it('Self-Signed EIP-2930 transaction submission via wrapped wallet', async function () {
      const provider = ethers.provider;
      const wp = getWallet(0).connect(provider);
      const wallet = wrapEthersSigner(wp);
      const feeData = await provider.getFeeData();

      const tx = Transaction.from({
        gasLimit: 250000,
        to: await testContract.getAddress(),
        value: 0,
        data: calldata,
        chainId: (await provider.getNetwork()).chainId,
        gasPrice: feeData.gasPrice,
        nonce: await provider.getTransactionCount(wallet.address),
        type: 1, // EIP-2930
        accessList:  [
          {
            address: await testContract.getAddress(),
            storageKeys: [
              "0x0000000000000000000000000000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000000000000000000000000001",
            ],
          },
        ],
      });

      const signedTx = await wallet.signTransaction(tx);
      let response = await provider.broadcastTransaction(signedTx);
      await response.wait();
      expect(entropy(response.data)).gte(EXPECTED_ENTROPY_ENCRYPTED);
      expect(response.data).not.eq(calldata);

      let receipt = await provider.getTransactionReceipt(response.hash);
      expect(receipt!.logs[0].data).equal(EXPECTED_EVENT);
    });

    it('should fail with invalid storage key length', async function () {
      const provider = ethers.provider;
      const publicAddr = await testContract.SENDER_ADDRESS();
      
      // Create an access list with invalid storage key length
      const accessList = {
        items: [
          {
            addr: await testContract.getAddress(),
            storageKeys: [
              ethers.zeroPadValue('0x01', 16) // Invalid: only 16 bytes instead of 32
            ]
          }
        ]
      };

      await expect(
        testContract.signEIP2930({
          nonce: await provider.getTransactionCount(publicAddr),
          gasPrice: ethers.parseUnits('100', 'gwei'),
          gasLimit: 250000,
          to: await testContract.getAddress(),
          value: 0,
          data: '0x',
          accessList,
          chainId: (await provider.getNetwork()).chainId,
        })
      ).to.be.revertedWithCustomError;
    });
  });

  describe('Access List Gas Tests', function() {
  
    describe('Gas Usage Comparison', function() {
      it('should compare gas usage with and without access lists for EIP-1559', async function() {
        const provider = ethers.provider;
        const publicAddr = await testContract.SENDER_ADDRESS();
        const contractAddress = await testContract.getAddress();
        
        const [slot0, slot1, slot2, slot3] = await testContract.getStorageSlots();
        
        // Test cases with different access list configurations
        const testCases = [
          {
            name: "No access list",
            accessList: { items: [] }
          },
          {
            name: "With storedNumber1 and storedNumber2",
            accessList: {
              items: [{
                addr: contractAddress,
                storageKeys: [slot0, slot1]
              }]
            }
          },
          {
            name: "With all storage slots",
            accessList: {
              items: [{
                addr: contractAddress,
                storageKeys: [slot0, slot1, slot2, slot3]
              }]
            }
          }
        ];
  
        for (const testCase of testCases) {
          console.log(`\nTesting: ${testCase.name}`);
          
          const signedTx = await testContract.signEIP1559({
            nonce: await provider.getTransactionCount(publicAddr),
            maxPriorityFeePerGas: ethers.parseUnits('20', 'gwei'),
            maxFeePerGas: ethers.parseUnits('120', 'gwei'),
            gasLimit: 500000,
            to: contractAddress,
            value: 0,
            data: '0x',
            accessList: testCase.accessList,
            chainId: (await provider.getNetwork()).chainId,
          });
  
          const response = await provider.broadcastTransaction(signedTx);
          const receipt = await verifyTxReceipt(response);
          
          console.log(`Gas used: ${receipt.gasUsed}`);
        }
      });
  
      it('should compare gas usage with and without access lists for EIP-2930', async function() {
        const provider = ethers.provider;
        const publicAddr = await testContract.SENDER_ADDRESS();
        const contractAddress = await testContract.getAddress();
  
        const [slot0, slot1, slot2, slot3] = await testContract.getStorageSlots();
  
        const testCases = [
          {
            name: "No access list",
            accessList: { items: [] }
          },
          {
            name: "With number slots",
            accessList: {
              items: [{
                addr: contractAddress,
                storageKeys: [slot0, slot1]
              }]
            }
          },
          {
            name: "With bytes slots",
            accessList: {
              items: [{
                addr: contractAddress,
                storageKeys: [slot2, slot3]
              }]
            }
          },
          {
            name: "With all slots",
            accessList: {
              items: [{
                addr: contractAddress,
                storageKeys: [slot0, slot1, slot2, slot3]
              }]
            }
          }
        ];
  
        for (const testCase of testCases) {
          console.log(`\nTesting: ${testCase.name}`);
          
          const signedTx = await testContract.signEIP2930({
            nonce: await provider.getTransactionCount(publicAddr),
            gasPrice: ethers.parseUnits('100', 'gwei'),
            gasLimit: 500000,
            to: contractAddress,
            value: 0,
            data: '0x',
            accessList: testCase.accessList,
            chainId: (await provider.getNetwork()).chainId,
          });
  
          const response = await provider.broadcastTransaction(signedTx);
          const receipt = await verifyTxReceipt(response);
          
          console.log(`Gas used: ${receipt.gasUsed}`);
        }
      });
    });
  });
  
});