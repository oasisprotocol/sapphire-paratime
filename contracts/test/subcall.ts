import { ethers } from 'hardhat';
import { expect } from 'chai';
import * as oasis from '@oasisprotocol/client';
import * as cborg from 'cborg';
import { SubcallTests } from '../typechain-types/contracts/tests/SubcallTests';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import {
  ContractTransactionReceipt,
  EventLog,
  Provider,
  getBytes,
  hexlify,
  parseEther,
  toBeArray,
  toBigInt,
  zeroPadValue,
} from 'ethers';
import { getRandomValues, randomInt } from 'crypto';

import { execSync } from 'child_process';

async function getDockerName() {
  const cmd =
    "docker ps --format '{{.Names}}' --filter status=running --filter expose=8545";
  const name = new TextDecoder().decode(execSync(cmd));
  return name.replace(/\n|\r/g, '');
}

async function getDockerEpoch(dockerName: string) {
  const cmd = `docker exec ${dockerName} /oasis-node control status -a unix:/serverdir/node/net-runner/network/client-0/internal.sock  | jq '.consensus.latest_epoch'`;
  return Number.parseInt(new TextDecoder().decode(execSync(cmd)));
}

async function getDockerDebondingInterval(dockerName: string) {
  const cmd = `docker exec ${dockerName} cat /serverdir/node/fixture.json | jq .network.staking_genesis.params.debonding_interval`;
  return Number.parseInt(new TextDecoder().decode(execSync(cmd)));
}

async function setDockerEpoch(dockerName: string, epoch: number) {
  const cmd = `docker exec ${dockerName} /oasis-node debug control set-epoch --epoch ${epoch} -a unix:/serverdir/node/net-runner/network/client-0/internal.sock`;
  execSync(cmd);
}

async function dockerSkipEpochs(args: {
  nEpochs?: number;
  dockerName?: string;
  targetEpoch?: number;
}) {
  let { nEpochs, dockerName, targetEpoch } = args;
  dockerName = dockerName || (await getDockerName());
  nEpochs = nEpochs || (await getDockerDebondingInterval(dockerName));
  let currentEpoch = await getDockerEpoch(dockerName);
  targetEpoch = targetEpoch || currentEpoch + nEpochs;
  const stride = 1;
  while (currentEpoch < targetEpoch) {
    currentEpoch += stride;
    if (currentEpoch >= targetEpoch) {
      currentEpoch = targetEpoch;
    }
    await setDockerEpoch(dockerName, currentEpoch);
  }
}

async function ensureBalance(
  contract: SubcallTests,
  initialBalance: bigint,
  owner: SignerWithAddress,
) {
  const provider = contract.runner!.provider!;
  const address = await contract.getAddress();
  const balance = await provider.getBalance(address);
  if (balance < initialBalance) {
    const resp = await owner.sendTransaction({
      to: address,
      value: initialBalance - balance,
      data: '0x',
    });
    await resp.wait();
  }
  const newBalance = await provider.getBalance(address);
  expect(newBalance).gte(initialBalance);

  return newBalance;
}

function decodeResult(receipt: ContractTransactionReceipt) {
  const event = (receipt.logs![0] as EventLog).args as unknown as {
    status: number;
    data: string;
  };
  return {
    status: event.status,
    data:
      event.status == 0
        ? cborg.decode(getBytes(event.data))
        : new TextDecoder().decode(getBytes(event.data)),
  };
}

describe('Subcall', () => {
  let contract: SubcallTests;
  let owner: SignerWithAddress;
  let ownerAddr: string;
  let ownerNativeAddr: Uint8Array;
  let kp: { publicKey: Uint8Array; secretKey: Uint8Array };
  let provider: Provider;

  before(async () => {
    const factory = await ethers.getContractFactory('SubcallTests');
    contract = (await factory.deploy({
      value: parseEther('1.0'),
    })) as unknown as SubcallTests;
    provider = contract.runner!.provider!;

    const signers = await ethers.getSigners();
    owner = signers[0] as unknown as SignerWithAddress;
    ownerAddr = await owner.getAddress();

    // Convert Ethereum address to native bytes with version prefix (V1=0x00)
    ownerNativeAddr = getBytes(zeroPadValue(ownerAddr, 21));
    expect(ownerNativeAddr.length).eq(21);

    const rawKp = await contract.generateRandomAddress();
    kp = {
      publicKey: getBytes(rawKp.publicKey),
      secretKey: getBytes(rawKp.secretKey),
    };
  });

  it('Derive Staking Addresses', async () => {
    const newKeypair = await contract.generateRandomAddress();

    // Verify `@oasisprotocol/client` matches Solidity.
    const alice = oasis.signature.NaclSigner.fromSeed(
      getBytes(newKeypair.secretKey),
      'this key is not important',
    );
    const computedPublicKey = hexlify(
      await oasis.staking.addressFromPublicKey(alice.public()),
    );

    expect(computedPublicKey).eq(hexlify(newKeypair.publicKey));
  });

  /// Verify that the 'accounts.Transfer' subcall operates similarly to
  /// native EVM transfers
  it('accounts.Transfer', async () => {
    // Ensure contract has an initial balance.
    const initialBalance = parseEther('1.0');
    await ensureBalance(contract, initialBalance, owner);

    // transfer balance-1 back to owner, then wait for transaction to be mined.
    let balance = await provider.getBalance(await contract.getAddress());

    const msg = cborg.encode({
      to: ownerNativeAddr,
      amount: [toBeArray(balance - 1n), new Uint8Array()],
    });
    let tx = await contract.testSubcall('accounts.Transfer', msg);
    let receipt = await tx.wait();

    // Transfer is success with: status=0, data=null
    if (!receipt) throw new Error('tx failed');
    const event = decodeResult(receipt);
    expect(event.status).eq(0n); // accounts.Transfer response status, 0 = success
    expect(event.data).is.null; // No data

    // Ensure contract only has 1 wei left.
    balance = await provider.getBalance(await contract.getAddress());
    expect(balance).eq(1);
  });

  it('Subcall.accounts_Transfer', async () => {
    const transferAmount = 1n;

    // Ensure contract has an initial balance.
    const initialBalance = parseEther('1.0');
    await ensureBalance(contract, initialBalance, owner);

    // Transfer using the Subcall.accounts_Transfer method.
    const tx = await contract.testAccountsTransfer(ownerAddr, transferAmount);
    const receipt = await tx.wait();
    if (!receipt) throw new Error('tx failed');

    // Ensure transfer has occurred
    const balance = await provider.getBalance(await contract.getAddress());
    expect(balance).eq(initialBalance - transferAmount);
  });

  it('consensus.Undelegate', async () => {
    // Ensure contract has an initial balance.
    const initialBalance = parseEther('1.0');
    await ensureBalance(contract, initialBalance, owner);

    let tx = await contract.testConsensusUndelegate(kp.publicKey, 0);
    await tx.wait();
    expect(await ethers.provider.getBalance(await contract.getAddress())).eq(
      initialBalance,
    );
  });

  /// Verifies that the 'consensus.Withdraw' operation can be parsed
  /// Currently it is not possble to withdraw anything
  it('consensus.Withdraw', async () => {
    // Ensure contract has an initial balance.
    const initialBalance = parseEther('1.0');
    await ensureBalance(contract, initialBalance, owner);

    expect(await ethers.provider.getBalance(await contract.getAddress())).eq(
      initialBalance,
    );

    let tx = await contract.testConsensusWithdraw(kp.publicKey, 0);
    await tx.wait();
    expect(await ethers.provider.getBalance(await contract.getAddress())).eq(
      initialBalance,
    );
  });

  /// Verifies that delegation works (when no receipt is requested)
  it('consensus.Delegate (without receipt)', async () => {
    // Ensure contract has an initial balance.
    const initialBalance = parseEther('100');
    await ensureBalance(contract, initialBalance, owner);

    let tx = await contract.testConsensusDelegate(
      kp.publicKey,
      parseEther('100'),
    );
    await tx.wait();

    expect(await ethers.provider.getBalance(await contract.getAddress())).eq(
      parseEther('0'),
    );
  });

  /// Verifies that delegation works, and when a receipt is requested it returns
  /// the number of shares allocated
  it('Delegate then begin Undelegate (with receipts)', async () => {
    const randomDelegate = getBytes(
      (await contract.generateRandomAddress()).publicKey,
    );

    // Ensure contract has an initial balance, above minimum delegation amount
    await ensureBalance(contract, parseEther('100'), owner);

    // Perform delegation, and request a receipt
    let receiptId = randomInt(2 ** 32, 2 ** 32 * 2);
    let tx = await contract.testConsensusDelegateWithReceipt(
      randomDelegate,
      parseEther('100'),
      receiptId,
    );
    let receipt = await tx.wait();
    expect(cborg.decode(getBytes((receipt?.logs![0] as EventLog).args!.data)))
      .is.null;
    expect(await ethers.provider.getBalance(await contract.getAddress())).eq(
      parseEther('0'),
    );

    // Ensure everything has been delegated
    const contractBalance = await ethers.provider.getBalance(
      await contract.getAddress(),
    );
    expect(contractBalance).eq(parseEther('0'));

    // Retrieve DelegateDone receipt after transaction is confirmed
    tx = await contract.testTakeReceipt(1, receiptId);
    receipt = await tx.wait();
    let result = cborg.decode(
      getBytes((receipt?.logs![0] as EventLog).args!.data),
    );
    expect(toBigInt(result.shares)).eq(100000000000);

    // Attempt undelegation of the full amount, with a receipt
    const nextReceiptId = receiptId + 1;
    tx = await contract.testConsensusUndelegateWithReceipt(
      randomDelegate,
      toBigInt(result.shares),
      nextReceiptId,
    );
    receipt = await tx.wait();

    // Retrieve UndelegateStart receipt
    tx = await contract.testTakeReceipt(2, nextReceiptId);
    receipt = await tx.wait();
    let resultBytes = (receipt?.logs![0] as EventLog).args!.data;
    result = cborg.decode(getBytes(resultBytes));
    expect(result.receipt).eq(nextReceiptId);

    // Try decoding undelegate start receipt
    const undelegateDecoded = await contract.testDecodeReceiptUndelegateStart(resultBytes);
    expect(undelegateDecoded[1]).eq(result.receipt);

    const initialContractBalance = await ethers.provider.getBalance(await contract.getAddress())

    await dockerSkipEpochs({ targetEpoch: result.epoch });

    // Retrieve UndelegateDone receipt
    tx = await contract.testTakeReceipt(3, result.receipt);
    receipt = await tx.wait();
    resultBytes = (receipt?.logs![0] as EventLog).args!.data;
    result = cborg.decode(getBytes(resultBytes));
    expect(await ethers.provider.getBalance(await contract.getAddress())).eq(
      initialContractBalance + parseEther('100'),
    );
  });

  it('Decode UndelegateStart receipt', async () => {
    let k = 0;
    for (let i = 1; i <= 8; i++) {
      const numI = new Uint8Array(i);
      for (let j = 1; j <= 8; j++) {
        const numJ = new Uint8Array(j);
        let payload;
        if (k % 2 == 0) {
          payload = cborg.encode({
            epoch: getRandomValues(numI),
            receipt: getRandomValues(numJ),
          });
        } else {
          payload = cborg.encode({
            receipt: getRandomValues(numJ),
            epoch: getRandomValues(numI),
          });
        }
        const [epoch, receipt] =
          await contract.testDecodeReceiptUndelegateStart(payload);
        expect(epoch).eq(toBigInt(numI));
        expect(receipt).eq(toBigInt(numJ));
        k += 1;
      }
    }
  });

  it('Decode UndelegateDone receipt', async () => {
    for (let i = 1; i <= 16; i++) {
      const numI = new Uint8Array(i);
      const payload = cborg.encode({
        amount: getRandomValues(numI),
      });
      const amount = await contract.testDecodeReceiptUndelegateDone(payload);
      expect(amount).eq(toBigInt(numI));
    }
  });

  /// Verifies that a variety of DelegateDone receipts can be parsed
  it('Decode Delegate receipt', async () => {
    expect(
      await contract.testDecodeReceiptDelegate(
        getBytes('0xa16673686172657345174876e800'),
      ),
    ).eq(100000000000);

    for (let i = 1; i <= 16; i++) {
      const num = new Uint8Array(i);
      const payload = cborg.encode({ shares: getRandomValues(num) });
      const shares = await contract.testDecodeReceiptDelegate(payload);
      expect(shares).eq(toBigInt(num));
    }
  });
});
