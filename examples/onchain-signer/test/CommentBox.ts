import { expect } from 'chai';
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

  it('Should comment', async function () {
    this.timeout(10000);

    const prevCommentCount = await commentBox.commentCount();

    const tx = await commentBox.comment('Hello, world!');
    await tx.wait();

    // Sapphire Mainnet/Testnet: Wait a few moments for nodes to catch up.
    const chainId = (await ethers.provider.getNetwork()).chainId;
    if (chainId == BigInt(23294) || chainId == BigInt(23295)) {
      await new Promise((r) => setTimeout(r, 6_000));
    }

    expect(await commentBox.commentCount()).eq(prevCommentCount + BigInt(1));
  });

  it('Should comment gasless', async function () {
    this.timeout(10000);

    const provider = ethers.provider;

    // You can set up sapphire-localnet image and run the test like this:
    // docker run -it -p8545:8545 -p8546:8546 ghcr.io/oasisprotocol/sapphire-localnet -to 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
    // npx hardhat test --grep proxy --network sapphire-localnet
    const chainId = (await provider.getNetwork()).chainId;
    if (chainId == BigInt(1337)) {
      this.skip();
    }

    const innercall = commentBox.interface.encodeFunctionData('comment', [
      'Hello, free world!',
    ]);

    // Sapphire Mainnet/Testnet: Wait a few moments for nodes to catch up.
    if (chainId == BigInt(23294) || chainId == BigInt(23295)) {
      await new Promise((r) => setTimeout(r, 6_000));
    }

    const tx = await gasless.makeProxyTx(
      await commentBox.getAddress(),
      innercall,
    );

    // TODO: https://github.com/oasisprotocol/sapphire-paratime/issues/179
    const response = await provider.broadcastTransaction(tx);
    await response.wait();

    const receipt = await provider.getTransactionReceipt(response.hash);
    if (!receipt || receipt.status != 1) throw new Error('tx failed');
  });
});
