/* eslint-disable @typescript-eslint/no-unused-vars */

import * as sapphire from '../src/index';
import Web3 from 'web3';
import { ethers } from 'ethers';
import HDWalletProvider from '@truffle/hdwallet-provider';

declare global {
  interface Window {
    ethereum?: ethers.providers.ExternalProvider;
  }
}

describe('ethers.js', () => {
  test('In the browser via `window.ethereum`.', () => {
    if (window.ethereum) {
      const signer = sapphire.wrap(
        new ethers.providers.Web3Provider(window.ethereum).getSigner(),
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
