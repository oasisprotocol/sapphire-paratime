/* eslint-disable @typescript-eslint/no-unused-vars */

import * as sapphire from '../src/index';
import Web3 from 'web3';
import { ethers as ethers5 } from 'ethers5';
import { ethers as ethers6 } from 'ethers6';
import HDWalletProvider from '@truffle/hdwallet-provider';

declare global {
  interface Window {
    ethereum?: ethers5.providers.ExternalProvider | ethers6.Eip1193Provider;
  }
}

describe('ethers.js 5', () => {
  test('In the browser via `window.ethereum`.', () => {
    if (window.ethereum) {
      const signer = sapphire.wrap(
        new ethers5.providers.Web3Provider(window.ethereum).getSigner(),
      );
    }
  });
  test('In Node via `ethers.Wallet`.', () => {
    const signer = sapphire
      .wrap(new ethers5.Wallet('0x0a5155afec0de...'))
      .connect(
        ethers5.getDefaultProvider(sapphire.NETWORKS.testnet.defaultGateway),
      );
  });
  test('Just a provider, no signer.', () => {
    const provider = sapphire.wrap(
      ethers5.getDefaultProvider(sapphire.NETWORKS.testnet.defaultGateway),
    );
  });
});

describe('ethers.js 6', () => {
  test('In the browser via `window.ethereum`.', async () => {
    if (window.ethereum) {
      const signer = sapphire.wrap(
        await new ethers6.BrowserProvider(
          window.ethereum as ethers6.Eip1193Provider,
        ).getSigner(),
      );
    }
  });
  test('In Node via `ethers.Wallet`.', () => {
    const signer = sapphire
      .wrap(new ethers6.Wallet('0x0a5155afec0de...'))
      .connect(
        ethers6.getDefaultProvider(sapphire.NETWORKS.testnet.defaultGateway),
      );
  });
  test('Just a provider, no signer.', () => {
    const provider = sapphire.wrap(
      ethers6.getDefaultProvider(sapphire.NETWORKS.testnet.defaultGateway),
    );
  });
});

test('web3.js', () => {
  const web3 = new Web3();
  if (web3.currentProvider) {
    web3.setProvider(sapphire.wrap(web3.currentProvider));
  }
});

test('EIP-1193', () => {
  if (window.ethereum) {
    const provider = sapphire.wrap(window.ethereum);
  }
});

test('truffle', () => {
  const provider = sapphire.wrap(
    new HDWalletProvider([''], 'https://testnet.sapphire.oasis.dev'),
  );
});
