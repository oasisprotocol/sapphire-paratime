import { ethers } from 'hardhat';
import { expect } from 'chai';
import { getRandomValues } from 'crypto';
import * as oasis from '@oasisprotocol/client';
import { Staking, Staking__factory } from '../typechain-types';
import { parseEther } from 'ethers/lib/utils';

describe('Staking', () => {
  let contract: Staking;
  let delegateTargets: string[] = [];

  before(async () => {
    const factory = (await ethers.getContractFactory(
      'Staking',
    )) as Staking__factory;
    contract = await factory.deploy();

    for (let i = 0; i < 10; i++) {
      const secretKey = new Uint8Array(32);
      getRandomValues(secretKey);

      const alice = oasis.signature.NaclSigner.fromSeed(
        ethers.utils.arrayify(secretKey),
        'this key is not important',
      );

      const computedPublicKey = ethers.utils.hexlify(
        await oasis.staking.addressFromPublicKey(alice.public()),
      );

      delegateTargets.push(computedPublicKey);
    }
  });

  it('Delegate', async () => {
    const tx = await contract.delegate(delegateTargets[0], {
      value: parseEther('101'),
    });
    const receipt = await tx.wait();
    console.log(receipt);
  });
});
