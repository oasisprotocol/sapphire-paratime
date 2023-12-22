/* eslint-disable @typescript-eslint/no-unused-vars */

import * as sapphire from '../src/index';
import { Web3 } from 'web3';
import { ethers } from 'ethers';

declare global {
  interface Window {
    ethereum?: ethers.Eip1193Provider;
  }
}

describe('ethers.js 6', () => {
  test('In the browser via `window.ethereum`.', async () => {
    if (window.ethereum) {
      const signer = sapphire.wrap(
        await new ethers.BrowserProvider(
          window.ethereum as ethers.Eip1193Provider,
        ).getSigner(),
      );
    }
  });
  test('In Node via `ethers.Wallet`.', () => {
    const signer = sapphire
      .wrap(new ethers.Wallet('0x0a5155afec0de...'))
      .connect(
        ethers.getDefaultProvider(sapphire.NETWORKS.testnet.defaultGateway),
      );
  });
  test('Just a provider, no signer.', () => {
    const provider = sapphire.wrap(
      ethers.getDefaultProvider(sapphire.NETWORKS.testnet.defaultGateway),
    );
  });
});

test('web3.js', () => {
  const web3 = new Web3();
  if (web3.currentProvider) {
    web3.setProvider(
      sapphire.wrap(
        web3.currentProvider.asEIP1193Provider(),
      ),
    );
  }
});

test('EIP-1193', () => {
  if (window.ethereum) {
    const provider = sapphire.wrap(window.ethereum);
  }
});
