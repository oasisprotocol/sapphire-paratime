// SPDX-License-Identifier: Apache-2.0

import { expect } from 'chai';
import { config, ethers } from 'hardhat';
import { Signer } from 'ethers';
import { SiweMessage } from 'siwe';
import '@nomicfoundation/hardhat-chai-matchers';

import { NETWORKS } from '@oasisprotocol/sapphire-paratime';
import { HardhatNetworkHDAccountsConfig } from 'hardhat/types';
import { SiweAuthTests } from '../typechain-types/contracts/tests/auth/SiweAuthTests';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Auth', function () {
  async function deploy(domain: string) {
    const factory = await ethers.getContractFactory('SiweAuthTests');
    const siweAuthTests = await factory.deploy(domain);
    await siweAuthTests.waitForDeployment();
    return siweAuthTests as unknown as SiweAuthTests;
  }

  async function siweMsg(
    domain: string,
    signerIdx: number,
    expiration?: Date,
    statement?: string,
    resources?: string[],
  ): Promise<string> {
    return new SiweMessage({
      domain,
      address: await (await ethers.provider.getSigner(signerIdx)).getAddress(),
      statement:
        statement ||
        `I accept the ExampleOrg Terms of Service: http://${domain}/tos`,
      uri: `http://${domain}:5173`,
      version: '1',
      chainId: Number((await ethers.provider.getNetwork()).chainId),
      expirationTime: expiration ? expiration.toISOString() : undefined,
      resources: resources || [],
    }).toMessage();
  }

  // Signs the given message as ERC-191 "personal_sign" message.
  async function erc191sign(msg: string, account: Signer) {
    return ethers.Signature.from(await account.signMessage(msg));
  }

  it('Should login', async function () {
    // Skip this test on non-sapphire chains.
    // It requires on-chain encryption and/or signing.
    if (
      Number((await ethers.provider.getNetwork()).chainId) !=
      NETWORKS.localnet.chainId
    ) {
      this.skip();
    }

    const siweAuthTests = await deploy('localhost');

    // Correct login.
    const accounts = config.networks.hardhat
      .accounts as HardhatNetworkHDAccountsConfig;
    const account = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(accounts.mnemonic),
      accounts.path + '/0',
    );
    const siweStr = await siweMsg('localhost', 0);
    await expect(
      await siweAuthTests.testLogin(
        siweStr,
        await erc191sign(siweStr, account),
      ),
    ).lengthOf.to.be.greaterThan(2); // Test if not 0x or empty.

    // Wrong domain.
    const siweStrWrongDomain = await siweMsg('localhost2', 0);
    await expect(
      siweAuthTests.testLogin(
        siweStrWrongDomain,
        await erc191sign(siweStrWrongDomain, account),
      ),
    ).to.be.reverted;

    // Mismatch signature based on the SIWE message.
    const siweStrWrongSig = await siweMsg('localhost', 1);
    await expect(
      siweAuthTests.testLogin(
        siweStrWrongSig,
        await erc191sign(siweStrWrongSig, account),
      ),
    ).to.be.reverted;

    // Expired login.
    let now = new Date();
    const siweStrExpired = await siweMsg(
      'localhost',
      0,
      new Date(Date.now() - 10_000), // Expired 10 seconds ago.
    );
    await expect(
      siweAuthTests.testLogin(
        siweStrExpired,
        await erc191sign(siweStrExpired, account),
      ),
    ).to.be.reverted;
  });

  it('Should call authenticated method', async function () {
    // Skip this test on non-sapphire chains.
    // It require on-chain encryption and/or signing.
    if (
      Number((await ethers.provider.getNetwork()).chainId) !=
      NETWORKS.localnet.chainId
    ) {
      this.skip();
    }

    const siweAuthTests = await deploy('localhost');

    // Author should read a very secret message.
    const accounts = config.networks.hardhat
      .accounts as HardhatNetworkHDAccountsConfig;
    const account = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(accounts.mnemonic),
      accounts.path + '/0',
    );
    const siweStr = await siweMsg('localhost', 0);
    const token = await siweAuthTests.testLogin(
      siweStr,
      await erc191sign(siweStr, account),
    );
    expect(await siweAuthTests.testVerySecretMessage(token)).to.be.equal(
      'Very secret message',
    );

    // Anyone else trying to read the very secret message should fail.
    const acc2 = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(accounts.mnemonic),
      accounts.path + '/1',
    );
    const siweStr2 = await siweMsg('localhost', 1);
    const token2 = await siweAuthTests.testLogin(
      siweStr2,
      await erc191sign(siweStr2, acc2),
    );
    await expect(siweAuthTests.testVerySecretMessage(token2)).to.be.reverted;

    // Same user, hijacked token from another contract/domain.
    const siweAuthTests2 = await deploy('localhost2');
    const siweStr3 = await siweMsg('localhost2', 0);
    const token3 = await siweAuthTests2.testLogin(
      siweStr3,
      await erc191sign(siweStr3, account),
    );
    await expect(siweAuthTests.testVerySecretMessage(token3)).to.be.reverted;

    // Expired token
    // on-chain block timestamps are integers representing seconds
    const expiration = new Date(Date.now() + 1000);
    const siweStr4 = await siweMsg('localhost', 0, expiration);
    const token4 = await siweAuthTests.testLogin(
      siweStr4,
      await erc191sign(siweStr4, account),
    );
    // Wait until the block time is greater than the expiration date
    await new Promise<void>((resolve, reject) => {
      ethers.provider.on('block', async (blockNumber) => {
        const ts = (await ethers.provider.getBlock(blockNumber))!.timestamp;
        if (ts * 1000 > expiration.getTime()) {
          resolve();
        }
      });
    });
    await expect(siweAuthTests.testVerySecretMessage(token4)).to.be.reverted;

    // Revoke token.
    const token5 = await siweAuthTests.testLogin(
      siweStr,
      await erc191sign(siweStr, account),
    );
    await siweAuthTests.testRevokeAuthToken(ethers.keccak256(token5));
    await expect(siweAuthTests.testVerySecretMessage(token5)).to.be.reverted;
  });

  it('Should change domain', async function () {
    const siweAuthTests = await deploy('localhost');
    expect(await siweAuthTests.domain()).to.be.equal('localhost');

    const tx = await siweAuthTests.setDomain('localhost2', { gasLimit: 50000 });
    await tx.wait();
    expect(await siweAuthTests.domain()).to.be.equal('localhost2');
  });

  it('Should verify statement from token', async function () {
    // Skip this test on non-sapphire chains.
    if (
      Number((await ethers.provider.getNetwork()).chainId) !=
      NETWORKS.localnet.chainId
    ) {
      this.skip();
    }

    const siweAuthTests = await deploy('localhost');

    // Create a custom statement
    const customStatement =
      'I agree to the terms and authorize this specific action';

    // Get the signer
    const accounts = config.networks.hardhat
      .accounts as HardhatNetworkHDAccountsConfig;
    const account = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(accounts.mnemonic),
      accounts.path + '/0',
    );

    // Create the SIWE message with the custom statement
    const siweStr = await siweMsg('localhost', 0, undefined, customStatement);

    // Generate token
    const token = await siweAuthTests.testLogin(
      siweStr,
      await erc191sign(siweStr, account),
    );

    // Verify the statement is correctly stored and retrieved
    expect(await siweAuthTests.testGetStatement(token)).to.equal(
      customStatement,
    );

    // Test statement verification function
    expect(
      await siweAuthTests.testStatementVerification(token, customStatement),
    ).to.be.true;

    // Test with incorrect statement
    expect(
      await siweAuthTests.testStatementVerification(token, 'Wrong statement'),
    ).to.be.false;
  });

  it('Should check resource access permissions', async function () {
    // Skip this test on non-sapphire chains.
    if (
      Number((await ethers.provider.getNetwork()).chainId) !=
      NETWORKS.localnet.chainId
    ) {
      this.skip();
    }

    const siweAuthTests = await deploy('localhost');

    // Define resources
    const resources = [
      'https://example.com/api/resource1',
      'https://example.com/api/resource2',
      'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    ];

    // Get the signer
    const accounts = config.networks.hardhat
      .accounts as HardhatNetworkHDAccountsConfig;
    const account = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(accounts.mnemonic),
      accounts.path + '/0',
    );

    // Create the SIWE message with resources
    const siweStr = await siweMsg(
      'localhost',
      0,
      undefined,
      undefined,
      resources,
    );

    // Generate token
    const token = await siweAuthTests.testLogin(
      siweStr,
      await erc191sign(siweStr, account),
    );

    // Check if the token grants access to specific resources
    expect(await siweAuthTests.testHasResourceAccess(token, resources[0])).to.be
      .true;
    expect(await siweAuthTests.testHasResourceAccess(token, resources[1])).to.be
      .true;
    expect(await siweAuthTests.testHasResourceAccess(token, resources[2])).to.be
      .true;

    // Check that token doesn't grant access to unauthorized resources
    expect(
      await siweAuthTests.testHasResourceAccess(
        token,
        'https://example.com/api/unauthorized',
      ),
    ).to.be.false;
  });

  it('Should handle both statement and resources in the same token', async function () {
    // Skip this test on non-sapphire chains.
    if (
      Number((await ethers.provider.getNetwork()).chainId) !=
      NETWORKS.localnet.chainId
    ) {
      this.skip();
    }

    const siweAuthTests = await deploy('localhost');

    // Define resources and statement
    const resources = [
      'https://example.com/api/profile',
      'https://example.com/api/data',
    ];
    const statement =
      'I authorize this application to access my profile and data';

    // Get the signer
    const accounts = config.networks.hardhat
      .accounts as HardhatNetworkHDAccountsConfig;
    const account = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(accounts.mnemonic),
      accounts.path + '/0',
    );

    // Create the SIWE message with both statement and resources
    const siweStr = await siweMsg(
      'localhost',
      0,
      undefined,
      statement,
      resources,
    );

    // Generate token
    const token = await siweAuthTests.testLogin(
      siweStr,
      await erc191sign(siweStr, account),
    );

    // Verify statement
    expect(await siweAuthTests.testGetStatement(token)).to.equal(statement);
    expect(await siweAuthTests.testStatementVerification(token, statement)).to
      .be.true;

    // Verify resource access
    const tokenResources = [...(await siweAuthTests.testGetResources(token))];
    expect(tokenResources).to.have.members(resources);
    expect(await siweAuthTests.testHasResourceAccess(token, resources[0])).to.be
      .true;
    expect(await siweAuthTests.testHasResourceAccess(token, resources[1])).to.be
      .true;
  });
});
