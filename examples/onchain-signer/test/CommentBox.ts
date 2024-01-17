import { expect } from 'chai';
import { ethers, config } from 'hardhat';
import { CommentBox, Gasless } from '../typechain-types';
import { EthereumKeypairStruct } from '../typechain-types/contracts/Gasless';
import { parseEther } from 'ethers';
import { HDAccountsUserConfig } from 'hardhat/types';

describe('CommentBox', function () {
  let commentBox: CommentBox;
  let gasless: Gasless;

  before(async () => {
    // Derive the private key of the 1st (counting from 0) builtin hardhat test account.
    const accounts = config.networks.hardhat
      .accounts as unknown as HDAccountsUserConfig;
    const wallet1 = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(accounts.mnemonic),
      accounts.path + `/1`,
    );

    // Use it as the relayer private key.
    // NOTE can be done by the contract with EthereumUtils.generateKeypair()
    const keypair: EthereumKeypairStruct = {
      addr: wallet1.address,
      secret: wallet1.privateKey,
      nonce: await ethers.provider.getTransactionCount(wallet1.address),
    };

    const CommentBoxFactory = await ethers.getContractFactory('CommentBox');
    commentBox = await CommentBoxFactory.deploy();
    await commentBox.waitForDeployment();

    const GaslessFactory = await ethers.getContractFactory('Gasless');
    gasless = await GaslessFactory.deploy(keypair, {
      value: parseEther('0.1'),
    });
    await gasless.waitForDeployment();
  });

  it('Should comment', async function () {
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
    // You can set up sapphire-localnet image and run the test like this:
    // docker run -it -p8545:8545 -p8546:8546 ghcr.io/oasisprotocol/sapphire-localnet -to 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
    // npx hardhat test --grep proxy --network sapphire-localnet
    const chainId = (await ethers.provider.getNetwork()).chainId;
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
    const response = await ethers.provider.broadcastTransaction(tx);
    await response.wait();

    const receipt = await ethers.provider.getTransactionReceipt(response.hash);
    if (!receipt || receipt.status != 1) throw new Error('tx failed');
  });
});
