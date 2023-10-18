import { expect } from 'chai';
import { config, ethers } from 'hardhat';
import { CommentBox, Gasless } from '../typechain-types';
import { HDAccountsUserConfig } from 'hardhat/types';

describe('CommentBox', function () {
  let commentBox : CommentBox;
  let gasless : Gasless;

  before(async () => {
    const CommentBoxFactory = await ethers.getContractFactory('CommentBox');
    commentBox = await CommentBoxFactory.deploy();
    await commentBox.deployed();

    const GaslessFactory = await ethers.getContractFactory('Gasless');
    gasless = await GaslessFactory.deploy();
    await gasless.deployed();

    // Derive the private key of the 1st (counting from 0) builtin hardhat test account.
    const accounts = (config.networks.hardhat.accounts as unknown) as HDAccountsUserConfig;
    const wallet1 = ethers.Wallet.fromMnemonic(
      accounts.mnemonic,
      accounts.path + `/1`,
    );

    // Use it as the relayer private key.
    await expect(
      await gasless.setKeypair({
        addr: wallet1.address,
        secret: Uint8Array.from(
          Buffer.from(wallet1.privateKey.substring(2), 'hex'),
        ),
        nonce: ethers.provider.getTransactionCount(wallet1.address),
      }),
    ).not.to.be.reverted;
  });

  it('Should comment', async function () {
    const prevCommentCount = await commentBox.commentCount();

    await expect(commentBox.comment('Hello, world!')).not.to.be.reverted;
    expect(await commentBox.commentCount()).eq(prevCommentCount.add(1));
  });

  it('Should comment gasless', async function () {
    // This test requires RNG and runs on the Sapphire network only.
    // You can set up sapphire-dev image and run the test like this:
    // docker run -it -p8545:8545 -p8546:8546 ghcr.io/oasisprotocol/sapphire-dev -to 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
    // npx hardhat test --grep proxy --network sapphire-localnet
    if ((await ethers.provider.getNetwork()).chainId == 1337) {
      this.skip();
    }
    const innercall = commentBox.interface.encodeFunctionData('comment', [
      'Hello, free world!',
    ]);
    const tx = await gasless.makeProxyTx(commentBox.address, innercall);

    // TODO: https://github.com/oasisprotocol/sapphire-paratime/issues/179
    const plainProvider = new ethers.providers.JsonRpcProvider(
      ethers.provider.connection,
    );
    const plainResp = await plainProvider.sendTransaction(tx);

    const receipt = await ethers.provider.waitForTransaction(plainResp.hash);
    if (!receipt || receipt.status != 1) throw new Error('tx failed');
  });
});
