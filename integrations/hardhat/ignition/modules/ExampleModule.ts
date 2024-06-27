import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import { Mnemonic, Wallet, keccak256 } from 'ethers';

export default buildModule('ExampleModule', (m) => {
  const wallet = Wallet.fromPhrase(
    Mnemonic.fromEntropy(keccak256('0x01')).phrase,
  );
  const example = m.contract('Example', [wallet.address]);
  return { example };
});
