import { expect } from 'chai';
import { config, ethers } from 'hardhat';

describe('CommentBox', function () {
  async function deployCommentBoxWithProxy() {
    const CommentBox = await ethers.getContractFactory('CommentBox');
    const commentBox = await CommentBox.deploy();

    const Gasless = await ethers.getContractFactory('Gasless');
    const gasless = await Gasless.deploy();

    // Derive the private key of the 1st (counting from 0) builtin hardhat test account.
    const accounts = config.networks.hardhat.accounts;
    const wallet1 = ethers.Wallet.fromMnemonic(
      accounts.mnemonic,
      accounts.path + `/1`,
    );
    const privateKey1 = wallet1.privateKey;

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

    return { commentBox, gasless };
  }

  describe('Deployment', function () {
    it('Should comment', async function () {
      const { commentBox, _gasless } = await deployCommentBoxWithProxy();

      await expect(commentBox.comment('Hello, world!')).not.to.be.reverted;
      expect(commentBox.comments()).length == 1;
    });

    it('Should comment gasless', async function () {
      // This test requires RNG and runs on the Sapphire network only.
      // You can set up sapphire-dev image and run the test like this:
      // docker run -it -p8545:8545 -p8546:8546 ghcr.io/oasisprotocol/sapphire-dev -to 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
      // npx hardhat test --grep proxy --network sapphire-localnet
      if ((await ethers.provider.getNetwork()).chainId == 1337) {
        this.skip();
      }
      const { commentBox, gasless } = await deployCommentBoxWithProxy();

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
});
