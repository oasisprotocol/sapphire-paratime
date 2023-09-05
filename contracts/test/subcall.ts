import { ethers } from 'hardhat';
import { expect } from 'chai';
import * as oasis from '@oasisprotocol/client';
import * as cborg from 'cborg';
import { SubcallTests } from '../typechain-types/contracts/tests/SubcallTests';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { parseEther } from 'ethers/lib/utils';
import { BigNumber, BigNumberish, ContractReceipt, Signer } from 'ethers';

function fromBigInt(bi: BigNumberish): Uint8Array {
  return ethers.utils.arrayify(
    ethers.utils.zeroPad(ethers.utils.hexlify(bi), 16),
  );
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
  expect(await contract.provider.getBalance(contract.address)).eq(
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

    // Verify @oasisprotocol/client matches Solidity
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
    // Ensure contract has an initial balance
    const initialBalance = parseEther('1.0');
    await ensureBalance(contract, initialBalance, owner);

    // transfer balance-1 back to owner, then wait for transaction to be mined
    const balance = await contract.provider.getBalance(contract.address);
    const message = cborg.encode({
      to: ownerNativeAddr,
      amount: [fromBigInt(balance.sub(1)), new Uint8Array()],
    });
    let tx = await contract.testSubcall('accounts.Transfer', message);
    let receipt = await tx.wait();

    // Transfer is success with: status=0, data=null
    const event = receipt.events![0].args! as unknown as {
      status: number;
      data: string;
    };
    expect(event.status).eq(0);
    expect(cborg.decode(ethers.utils.arrayify(event.data))).is.null;

    // Ensure contract only has 1 wei left
    expect(await contract.provider.getBalance(contract.address)).eq(1);

    // Transfer using the Subcall.accounts_Transfer method
    tx = await contract.testAccountsTransfer(ownerAddr, 1);
    receipt = await tx.wait();

    // Ensure contract only no wei left
    expect(await contract.provider.getBalance(contract.address)).eq(0);
  });

  it('consensus.Delegate', async () => {
    // Ensure contract has an initial balance
    const initialBalance = parseEther('1.0');
    await ensureBalance(contract, initialBalance, owner);

    // Delegate 0, ensure balance does not change
    let tx = await contract.testConsensusDelegate(kp.publicKey, 0);
    await tx.wait();
    expect(await contract.provider.getBalance(contract.address)).eq(
      initialBalance,
    );

    // Manually encode & submit consensus.Delegate message
    const message = cborg.encode({
      to: kp.publicKey,
      amount: [fromBigInt(0), new Uint8Array()],
    });
    tx = await contract.testSubcall('consensus.Delegate', message);
    let receipt = await tx.wait();

    // Transfer is success with: status=0, data=null
    const event = receipt.events![0].args! as unknown as {
      status: number;
      data: string;
    };
    const decodedEvent = {
      status: event.status,
      data:
        event.status == 0
          ? cborg.decode(ethers.utils.arrayify(event.data))
          : new TextDecoder().decode(ethers.utils.arrayify(event.data)),
    };
    expect(event.status).eq(0);
    expect(cborg.decode(ethers.utils.arrayify(event.data))).is.null;

    // Ensure contract only no wei left
    //expect(await contract.provider.getBalance(contract.address)).eq(0);
  });

  it('consensus.Undelegate', async () => {
    // Ensure contract has an initial balance
    const initialBalance = parseEther('1.0');
    await ensureBalance(contract, initialBalance, owner);

    let tx = await contract.testConsensusUndelegate(kp.publicKey, 0);
    await tx.wait();
    expect(await contract.provider.getBalance(contract.address)).eq(
      initialBalance,
    );
  });

  it('consensus.Withdraw', async () => {
    // Ensure contract has an initial balance
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

  it('consensus.Deposit', async () => {
    // Ensure contract has an initial balance
    const initialBalance = parseEther('1.0');
    await ensureBalance(contract, initialBalance, owner);

    const message = cborg.encode({
      to: kp.publicKey,
      amount: [fromBigInt(0), new Uint8Array()],
    });
    const tx = await contract.testSubcall('consensus.Deposit', message);
    let result = decodeResult(await tx.wait());

    // consensus.Deposit cannot be called from Solidity
    // It requires the transaction signer to be a consensus account!
    expect(result.status).eq(4);
    expect(result.data).eq('consensus');
  });
});
