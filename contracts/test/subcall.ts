import { ethers } from 'hardhat';
import { expect } from 'chai';
import * as oasis from '@oasisprotocol/client';
import * as cborg from 'cborg';
import { SubcallTests } from '../typechain-types/contracts/tests/SubcallTests';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { arrayify, parseEther } from 'ethers/lib/utils';
import { BigNumber, BigNumberish, ContractReceipt } from 'ethers';
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

function fromBigInt(bi: BigNumberish): Uint8Array {
  return ethers.utils.arrayify(
    ethers.utils.zeroPad(ethers.utils.hexlify(bi), 16),
  );
}

function bufToBigint(buf: Uint8Array): bigint {
  let ret = 0n;
  for (const i of buf.values()) {
    ret = (ret << 8n) + BigInt(i);
  }
  return ret;
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
  expect(newBalance).eq(initialBalance);
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

  /// Verify that the 'accounts.Transfer' subcall operates similarly to
  /// native EVM transfers
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

  /// Verifies that the 'consensus.Withdraw' operation can be parsed
  /// Currently it is not possble to withdraw anything
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

    expect(await contract.provider.getBalance(contract.address)).eq(
      parseEther('0'),
    );
  });

  /// Verifies that delegation works, and when a receipt is requested it returns
  /// the number of shares allocated
  it('Delegate then begin Undelegate (with receipts)', async () => {
    const randomDelegate = arrayify(
      (await contract.generateRandomAddress()).publicKey,
    );

    // Ensure contract has an initial balance, above minimum delegation amount
    const initialBalance = parseEther('100');
    await ensureBalance(contract, initialBalance, owner);

    // Perform delegation, and request a receipt
    let receiptId = randomInt(2 ** 32, 2 ** 32 * 2);
    let tx = await contract.testConsensusDelegateWithReceipt(
      randomDelegate,
      parseEther('100'),
      receiptId,
    );
    let receipt = await tx.wait();
    expect(cborg.decode(arrayify(receipt.events![0].args!.data))).is.null;
    expect(await contract.provider.getBalance(contract.address)).eq(
      parseEther('0'),
    );

    // Ensure everything has been delegated
    const contractBalance = await contract.provider.getBalance(
      contract.address,
    );
    expect(contractBalance).eq(parseEther('0'));

    // Retrieve DelegateDone receipt after transaction is confirmed
    tx = await contract.testTakeReceipt(1, receiptId);
    receipt = await tx.wait();
    let result = cborg.decode(arrayify(receipt.events![0].args!.data));
    expect(bufToBigint(result.shares)).eq(100000000000);

    // Attempt undelegation of the full amount, with a receipt
    const nextReceiptId = receiptId + 1;
    tx = await contract.testConsensusUndelegateWithReceipt(
      randomDelegate,
      result.shares,
      nextReceiptId,
    );
    receipt = await tx.wait();

    // Retrieve UndelegateStart receipt
    tx = await contract.testTakeReceipt(2, nextReceiptId);
    receipt = await tx.wait();
    result = cborg.decode(arrayify(receipt.events![0].args!.data));
    expect(result.receipt).eq(nextReceiptId);

    await dockerSkipEpochs({ targetEpoch: result.epoch });

    // Retrieve UndelegateStart receipt
    tx = await contract.testTakeReceipt(3, result.receipt);
    receipt = await tx.wait();
    result = cborg.decode(arrayify(receipt.events![0].args!.data));
    expect(await contract.provider.getBalance(contract.address)).eq(
      parseEther('100'),
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
        expect(epoch).eq(bufToBigint(numI));
        expect(receipt).eq(bufToBigint(numJ));
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
      expect(amount).eq(bufToBigint(numI));
    }
  });

  /// Verifies that a variety of DelegateDone receipts can be parsed
  it('Decode Delegate receipt', async () => {
    expect(
      await contract.testDecodeReceiptDelegate(
        ethers.utils.arrayify('0xa16673686172657345174876e800'),
      ),
    ).eq(100000000000);

    for (let i = 1; i <= 16; i++) {
      const num = new Uint8Array(i);
      const payload = cborg.encode({ shares: getRandomValues(num) });
      const shares = await contract.testDecodeReceiptDelegate(payload);
      expect(shares).eq(bufToBigint(num));
    }
  });
});
