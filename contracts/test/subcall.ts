import { ethers } from 'hardhat';
import { expect } from 'chai';
import * as oasis from '@oasisprotocol/client';
import * as cborg from 'cborg';
import { SubcallTests } from '../typechain-types/contracts/tests/SubcallTests';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import {
  AbiCoder,
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
    const subcallFactory = await ethers.getContractFactory('Subcall');
    const subcallLib = await subcallFactory.deploy();
    await subcallLib.waitForDeployment();

    const factory = await ethers.getContractFactory('SubcallTests', {
      libraries: { Subcall: await subcallLib.getAddress() },
    });
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

    // Skip random address generation when running in hardhat
    if ((await provider.getNetwork()).chainId != 31337n) {
      const rawKp = await contract.generateRandomAddress();
      kp = {
        publicKey: getBytes(rawKp.publicKey),
        secretKey: getBytes(rawKp.secretKey),
      };
    }
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
    const undelegateDecoded = await contract.testDecodeReceiptUndelegateStart(
      resultBytes,
    );
    expect(undelegateDecoded[1]).eq(result.receipt);

    const initialContractBalance = await ethers.provider.getBalance(
      await contract.getAddress(),
    );

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

  /// Verifies that the 'rofl.IsAuthorizedOrigin' operation can be executed
  /// Currently it should always revert as there is no way to mock a ROFL app in tests.
  it('rofl.IsAuthorizedOrigin', async () => {
    const appId = getBytes(zeroPadValue(ownerAddr, 21));

    // First test the raw subcall.
    const msg = cborg.encode(appId);
    let tx = await contract.testSubcall('rofl.IsAuthorizedOrigin', msg);
    let receipt = await tx.wait();

    if (!receipt) throw new Error('tx failed');
    const event = decodeResult(receipt);
    expect(event.status).eq(0n); // rofl.IsAuthorizedOrigin response status, 0 = success
    expect(event.data).eq(false); // Boolean false to indicate failure.

    // Also test the Subcall.roflEnsureAuthorizedOrigin wrapper.
    tx = await contract.testRoflEnsureAuthorizedOrigin(appId);
    await expect(tx).to.be.reverted;
  });

  describe('Should successfully parse CBOR uint/s', () => {
    it('Should successfully parse CBOR uint8', async () => {
      const MAX_SAFE_UINT8 = 255n;

      // bytes = 0x18FF
      const bytes = cborg.encode(MAX_SAFE_UINT8);

      const [newOffset, parsedCborUint] = await contract.testParseCBORUint(
        bytes,
        0,
      );

      expect(parsedCborUint).eq(MAX_SAFE_UINT8);
      expect(newOffset).eq(1 + 1);
    });

    it('Should successfully parse CBOR uint16', async () => {
      const MAX_SAFE_UINT16 = 65535n;

      // bytes = 0x19FFFF
      const bytes = cborg.encode(MAX_SAFE_UINT16);

      const [newOffset, parsedCborUint] = await contract.testParseCBORUint(
        bytes,
        0,
      );

      expect(parsedCborUint).eq(MAX_SAFE_UINT16);
      expect(newOffset).eq(2 + 1);
    });

    it('Should successfully parse CBOR uint32', async () => {
      const MAX_SAFE_UINT32 = 4294967295n;

      // bytes = 0x1AFFFFFFFF
      const bytes = cborg.encode(MAX_SAFE_UINT32);

      const [newOffset, parsedCborUint] = await contract.testParseCBORUint(
        bytes,
        0,
      );

      expect(parsedCborUint).eq(MAX_SAFE_UINT32);
      expect(newOffset).eq(4 + 1);
    });

    it('Should successfully parse CBOR uint64', async () => {
      const MAX_SAFE_UINT64 = 18446744073709551615n;

      // bytes = 0x1BFFFFFFFFFFFFFFFF
      const bytes = cborg.encode(MAX_SAFE_UINT64);

      const [newOffset, parsedCborUint] = await contract.testParseCBORUint(
        bytes,
        0,
      );

      expect(parsedCborUint).eq(MAX_SAFE_UINT64);
      expect(newOffset).eq(8 + 1);
    });

    it('Should successfully parse CBOR uint128', async () => {
      const MAX_SAFE_UINT128 = 340282366920938463463374607431768211455n;

      const hex = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';
      const uint128bytes = Uint8Array.from(
        Buffer.from(hex.replace('0x', ''), 'hex'),
      );

      const bytes = cborg.encode(uint128bytes);

      const [newOffset, parsedCborUint] = await contract.testParseCBORUint(
        bytes,
        0,
      );

      expect(parsedCborUint).eq(MAX_SAFE_UINT128);
      expect(newOffset).eq(16 + 1);
    });

    it('Should successfully parse CBOR uint256', async () => {
      const MAX_SAFE_UINT256 =
        115792089237316195423570985008687907853269984665640564039457584007913129639935n;

      const hex =
        '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';
      const uint256bytes = Uint8Array.from(
        Buffer.from(hex.replace('0x', ''), 'hex'),
      );

      const bytes = cborg.encode(uint256bytes);

      const [newOffset, parsedCborUint] = await contract.testParseCBORUint(
        bytes,
        0,
      );

      expect(parsedCborUint).eq(MAX_SAFE_UINT256);
      expect(newOffset).eq(33 + 1);
    });
  });

  it('CallDataPublicKey CBOR parsing works', async () => {
    const example =
      '0xa26565706f636818336a7075626c69635f6b6579a4636b65795820969010b54ebcda50415eedf2554109edac4735a58ddf1e4b43b9a765fa734f0a68636865636b73756d5820dfe9285ada1376ac95a411ee68d3991a8c72b68cea1fcc79d084f8df2d93f646697369676e617475726558405ed83560ea48a003993cb0b1c5610272a4077bc02242215996029c14476fd33e1c04a84dc99a8c76f4111a758dd185cd0b588469cfde1214898c8571ac170e066a65787069726174696f6e183d';
    const data = cborg.decode(getBytes(example));
    const result = await contract.testParseCallDataPublicKey(example);
    expect(result.epoch).eq(data.epoch);
    expect(result.public_key.key).eq(hexlify(data.public_key.key));
    expect(result.public_key.checksum).eq(hexlify(data.public_key.checksum));
    expect(result.public_key.expiration).eq(data.public_key.expiration);
    expect(result.public_key.signature[0]).eq(
      hexlify(data.public_key.signature.slice(0, 32)),
    );
    expect(result.public_key.signature[1]).eq(
      hexlify(data.public_key.signature.slice(32)),
    );
  });

  it('core.CallDataPublicKey works', async () => {
    // Perform call directly using eth_call
    const coder = AbiCoder.defaultAbiCoder();
    const doop = await provider.call({
      to: '0x0100000000000000000000000000000000000103',
      data: coder.encode(
        ['string', 'bytes'],
        ['core.CallDataPublicKey', cborg.encode(null)],
      ),
    });
    const [subcall_status, subcall_raw_response] = coder.decode(
      ['uint', 'bytes'],
      doop,
    );
    expect(subcall_status).eq(0n);

    // Verify the form of the raw response
    const subcall_data = cborg.decode(getBytes(subcall_raw_response));
    expect(subcall_data).haveOwnProperty('epoch');
    expect(subcall_data).haveOwnProperty('public_key');

    const subcall_publickey = subcall_data.public_key;
    expect(subcall_publickey).has.haveOwnProperty('key');
    expect(subcall_publickey.key).lengthOf(32);
    expect(subcall_publickey).has.haveOwnProperty('checksum');
    expect(subcall_publickey.checksum).lengthOf(32);
    expect(subcall_publickey).has.haveOwnProperty('signature');
    expect(subcall_publickey.signature).lengthOf(64);
    expect(subcall_publickey).has.haveOwnProperty('expiration');

    // Verify CBOR parsing via contract returns the same result
    const result = await contract.testCoreCallDataPublicKey.staticCall();
    expect(result.epoch).eq(subcall_data.epoch);
    expect(result.public_key.key).eq(hexlify(subcall_data.public_key.key));
    expect(result.public_key.checksum).eq(
      hexlify(subcall_data.public_key.checksum),
    );
    expect(result.public_key.expiration).eq(subcall_data.public_key.expiration);

    // Signature is sliced in half, to fit into two bytes32 elements
    const sig0 = subcall_publickey.signature.slice(0, 32);
    const sig1 = subcall_publickey.signature.slice(32);
    expect(result.public_key.signature[0]).eq(hexlify(sig0), 'Sig0 mismatch');
    expect(result.public_key.signature[1]).eq(hexlify(sig1), 'Sig1 mismatch');
  });

  it('core.CurrentEpoch works', async () => {
    const actualEpoch = await contract.testCoreCurrentEpoch.staticCall();
    const expectedEpoch = await getDockerEpoch(await getDockerName());
    expect(Number(actualEpoch)).eq(expectedEpoch);
  });
});
