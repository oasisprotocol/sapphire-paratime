import { expect } from 'chai';
import { Context } from 'mocha';
import { ethers } from 'hardhat';
import { parseEther, Wallet } from 'ethers';
import { CommentBox, Gasless } from '../typechain-types';
import { EthereumKeypairStruct } from '../typechain-types/contracts/Gasless';

describe('CommentBox', function () {
  let commentBox: CommentBox;
  let gasless: Gasless;

  before(async () => {
    const CommentBoxFactory = await ethers.getContractFactory('CommentBox');
    commentBox = await CommentBoxFactory.deploy();
    await commentBox.waitForDeployment();
    console.log('    . deployed CommentBox to', await commentBox.getAddress());

    const provider = ethers.provider;

    // Generate a random wallet for the gasless tx signing account
    const wallet = Wallet.createRandom(provider);
    const keypair: EthereumKeypairStruct = {
      addr: wallet.address,
      secret: wallet.privateKey,
      nonce: await provider.getTransactionCount(wallet.address),
    };

    // Any eth passed to constructor will be sent to the random wallet
    const GaslessFactory = await ethers.getContractFactory('Gasless');
    gasless = await GaslessFactory.deploy(keypair, {
      value: parseEther('0.1'),
    });
    console.log('    . deployed Gasless to', await gasless.getAddress());
    console.log('    . gasless pubkey', wallet.address);
  });

  async function commentGasless(comment: string, plain: boolean) {
    const provider = ethers.provider;

    const innercall = commentBox.interface.encodeFunctionData('comment', [
      comment,
    ]);

    const prevCommentCount = await commentBox.commentCount();
    let tx: string;
    if (plain) {
      tx = await gasless.makeProxyTxPlain(
        await commentBox.getAddress(),
        innercall,
      );
    } else {
      tx = await gasless.makeProxyTx(await commentBox.getAddress(), innercall);
    }

    // TODO: https://github.com/oasisprotocol/sapphire-paratime/issues/179
    const response = await provider.broadcastTransaction(tx);
    await response.wait();

    const receipt = await provider.getTransactionReceipt(response.hash);
    if (!receipt || receipt.status != 1) throw new Error('tx failed');

    expect(await commentBox.commentCount()).eq(prevCommentCount + BigInt(1));
  }

  it('Should comment', async function () {
    const prevCommentCount = await commentBox.commentCount();

    const tx = await commentBox.comment('Hello, world!');
    await tx.wait();

    expect(await commentBox.commentCount()).eq(prevCommentCount + BigInt(1));
  });

  it('Should comment gasless (encrypted)', async function () {
    // Set up sapphire-localnet image to run this test:
    // docker run -it -p8544-8548:8544-8548 ghcr.io/oasisprotocol/sapphire-localnet
    if ((await ethers.provider.getNetwork()).chainId == BigInt(1337)) {
      this.skip();
    }

    await commentGasless('Hello, c10l world', false);
  });

  it('Should comment gasless (plain)', async function () {
    // Set up sapphire-localnet image to run this test:
    // docker run -it -p8544-8548:8544-8548 ghcr.io/oasisprotocol/sapphire-localnet
    if ((await ethers.provider.getNetwork()).chainId == BigInt(1337)) {
      this.skip();
    }

    await commentGasless('Hello, plain world', true);
  });
});
