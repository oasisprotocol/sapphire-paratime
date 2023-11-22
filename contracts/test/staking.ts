import { ethers } from 'hardhat';
import { expect } from 'chai';
import { getRandomValues } from 'crypto';
import * as oasis from '@oasisprotocol/client';
import { Staking, Staking__factory } from '../typechain-types';
import { StakingTests } from '../typechain-types/contracts/tests';
import { formatEther, parseEther } from 'ethers/lib/utils';

async function randomStakingAddress() {
  const secretKey = new Uint8Array(32);
  getRandomValues(secretKey);
  const alice = oasis.signature.NaclSigner.fromSeed(
    ethers.utils.arrayify(secretKey),
    'this key is not important',
  );
  const computedPublicKey = ethers.utils.hexlify(
    await oasis.staking.addressFromPublicKey(alice.public()),
  );
  return computedPublicKey;
}

describe('Staking', () => {
  let contract: StakingTests;
  let stakers: Staking[] = [];
  let delegateTargets: string[] = [];

  before(async () => {
    const n = 2;
    for (let i = 0; i < n; i++) {
      delegateTargets.push(await randomStakingAddress());
    }

    const factory = await ethers.getContractFactory('StakingTests');
    contract = (await factory.deploy(n)) as StakingTests;

    for (let i = 0; i < n; i++) {
      const staker = Staking__factory.connect(
        await contract.stakers(i),
        factory.signer,
      );
      stakers.push(staker);
    }
  });

  it('Delegate', async () => {
    // Submit the first delegation
    let tx = await stakers[0].delegate(delegateTargets[0], {
      value: parseEther('100'),
    });
    let receipt = await tx.wait();
    let bal = await stakers[0].provider.getBalance(contract.address);
    expect(bal).eq(0n);
    let args = receipt.events![0].args!;
    const firstReceiptId = Number.parseInt(args.receiptId);

    // Submit the second delegation
    tx = await stakers[0].delegate(delegateTargets[0], {
      value: parseEther('100'),
    });
    receipt = await tx.wait();
    bal = await stakers[0].provider.getBalance(contract.address);
    expect(bal).eq(0n);

    // Verify receipt IDs increment
    args = receipt.events![0].args!;
    const secondReceiptId = Number.parseInt(args.receiptId);
    expect(secondReceiptId).eq(firstReceiptId + 1);
  });

  // Note: This should not work!
  // multiple delegations in same tx is not supported!
  it('Multi Delegate', async () => {
    const m = 2;
    const d = delegateTargets.slice(0, m);
    const tx = await contract.delegate(d, { value: parseEther('200') });
    expect(tx.wait()).revertedWithoutReason();
  });
});
