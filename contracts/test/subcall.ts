import { ethers } from 'hardhat';
import { expect } from 'chai';
import * as oasis from '@oasisprotocol/client';
import * as cborg from 'cborg';
import { SubcallTests } from '../typechain-types/contracts/tests/SubcallTests';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { arrayify, formatEther, hexlify, parseEther } from 'ethers/lib/utils';
import { BigNumber, BigNumberish, ContractReceipt } from 'ethers';
import { getRandomValues, randomInt } from 'crypto';

function fromBigInt(bi: BigNumberish): Uint8Array {
  return ethers.utils.arrayify(
    ethers.utils.zeroPad(ethers.utils.hexlify(bi), 16),
  );
}

function bufToBigint (buf: Uint8Array): bigint {
  let ret = 0n;
  for (const i of buf.values()) {
    ret = (ret << 8n) + BigInt(i);
  }
  return ret
}

async function ensureBalance(
  contract: SubcallTests,
  initialBalance: BigNumber,
  owner: SignerWithAddress,
) {
  const balance = await contract.provider.getBalance(contract.address);
  if (balance.lt(initialBalance)) {
    const resp = await owner.sendTransaction({
      to: contract.address,
      value: initialBalance.sub(balance),
      data: '0x',
    });
    await resp.wait();
  }
  const newBalance = await contract.provider.getBalance(contract.address);
  console.log("New Balance", formatEther(newBalance));
  expect(newBalance).eq(
    initialBalance,
  );
}

function decodeResult(receipt: ContractReceipt) {
  const event = receipt.events![0].args! as unknown as {
    status: number;
    data: string;
  };
  return {
    status: event.status,
    data:
      event.status == 0
        ? cborg.decode(ethers.utils.arrayify(event.data))
        : new TextDecoder().decode(ethers.utils.arrayify(event.data)),
  };
}

describe('Subcall', () => {
  let contract: SubcallTests;
  let owner: SignerWithAddress;
  let ownerAddr: string;
  let ownerNativeAddr: Uint8Array;
  let kp: { publicKey: Uint8Array; secretKey: Uint8Array };

  before(async () => {
    const factory = await ethers.getContractFactory('SubcallTests');
    contract = (await factory.deploy({
      value: parseEther('1.0'),
    })) as SubcallTests;

    const signers = await ethers.getSigners();
    owner = signers[0];
    ownerAddr = await owner.getAddress();

    // Convert Ethereum address to native bytes with version prefix (V1=0x00)
    ownerNativeAddr = ethers.utils.arrayify(
      ethers.utils.zeroPad(ownerAddr, 21),
    );
    expect(ownerNativeAddr.length).eq(21);

    const rawKp = await contract.generateRandomAddress();
    kp = {
      publicKey: ethers.utils.arrayify(rawKp.publicKey),
      secretKey: ethers.utils.arrayify(rawKp.secretKey),
    };
  });

  it('Derive Staking Addresses', async () => {
    const newKeypair = await contract.generateRandomAddress();

    // Verify `@oasisprotocol/client` matches Solidity.
    const alice = oasis.signature.NaclSigner.fromSeed(
      ethers.utils.arrayify(newKeypair.secretKey),
      'this key is not important',
    );
    const computedPublicKey = ethers.utils.hexlify(
      await oasis.staking.addressFromPublicKey(alice.public()),
    );

    expect(computedPublicKey).eq(ethers.utils.hexlify(newKeypair.publicKey));
  });

  it('accounts.Transfer', async () => {
    // Ensure contract has an initial balance.
    const initialBalance = parseEther('1.0');
    await ensureBalance(contract, initialBalance, owner);

    // transfer balance-1 back to owner, then wait for transaction to be mined.
    const balance = await contract.provider.getBalance(contract.address);
    let tx = await contract.testSubcall(
      'accounts.Transfer',
      cborg.encode({
        to: ownerNativeAddr,
        amount: [fromBigInt(balance.sub(1)), new Uint8Array()],
      }),
    );
    let receipt = await tx.wait();

    // Transfer is success with: status=0, data=null
    const event = decodeResult(receipt);
    expect(event.status).eq(0);
    expect(event.data).is.null;

    // Ensure contract only has 1 wei left.
    expect(await contract.provider.getBalance(contract.address)).eq(1);

    // Transfer using the Subcall.accounts_Transfer method.
    tx = await contract.testAccountsTransfer(ownerAddr, 1);
    receipt = await tx.wait();

    // Ensure contract only no wei left.
    expect(await contract.provider.getBalance(contract.address)).eq(0);
  });

  it('consensus.Undelegate', async () => {
    // Ensure contract has an initial balance.
    const initialBalance = parseEther('1.0');
    await ensureBalance(contract, initialBalance, owner);

    let tx = await contract.testConsensusUndelegate(kp.publicKey, 0);
    await tx.wait();
    expect(await contract.provider.getBalance(contract.address)).eq(
      initialBalance,
    );
  });

  it('consensus.Withdraw', async () => {
    // Ensure contract has an initial balance.
    const initialBalance = parseEther('1.0');
    await ensureBalance(contract, initialBalance, owner);

    expect(await contract.provider.getBalance(contract.address)).eq(
      initialBalance,
    );

    let tx = await contract.testConsensusWithdraw(kp.publicKey, 0);
    await tx.wait();
    expect(await contract.provider.getBalance(contract.address)).eq(
      initialBalance,
    );
  });

  it('Decode DelegateDone receipt', async () => {
    expect(await contract.testDecodeReceiptDelegateDone(ethers.utils.arrayify('0xa16673686172657345174876e800'))).eq(100000000000);
    for( let i = 1; i <= 16; i++ ) {
      const num = new Uint8Array(i);
      const payload = cborg.encode({shares: getRandomValues(num)})
      const shares = await contract.testDecodeReceiptDelegateDone(payload);
      expect(shares).eq(bufToBigint(num));
    }
  });

  it('consensus.Delegate (without receipt)', async () => {
    // Ensure contract has an initial balance.
    const initialBalance = parseEther('100.0');
    await ensureBalance(contract, initialBalance, owner);

    let tx = await contract.testConsensusDelegate(kp.publicKey, parseEther('100'));
    await tx.wait();

    expect(await contract.provider.getBalance(contract.address)).eq(
      parseEther('0'),
    );
  });

  it('consensus.Delegate (with receipt)', async () => {
    const randomDelegate = arrayify((await contract.generateRandomAddress()).publicKey);

    // Ensure contract has an initial balance, above minimum delegation amount
    const initialBalance = parseEther('100');
    await ensureBalance(contract, initialBalance, owner);

    // Perform delegation, and request a receipt
    const receiptId = randomInt(2**32, (2**32) * 2);
    let tx = await contract.testConsensusDelegateWithReceipt(randomDelegate, parseEther('100'), receiptId);
    let receipt = await tx.wait();
    expect(cborg.decode(arrayify(receipt.events![0].args!.data))).is.null;

    // Ensure everything has been delegated
    const contractBalance = await contract.provider.getBalance(contract.address);
    expect(contractBalance).eq(parseEther('0'));

    // Retrieve DelegateDone receipt after transaction is confirmed
    tx = await contract.testTakeReceipt(1, receiptId);
    receipt = await tx.wait();
    const result = cborg.decode(arrayify(receipt.events![0].args!.data));
    expect(bufToBigint(result.shares)).eq(100000000000);
  });
});
