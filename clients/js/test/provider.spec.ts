// SPDX-License-Identifier: Apache-2.0

import { Wallet, JsonRpcProvider, BaseContract, BrowserProvider } from 'ethers';
import {
  wrapEthereumProvider,
  NETWORKS,
  isLegacyProvider,
  isWrappedEthereumProvider,
  isWrappedRequestFn,
} from '@oasisprotocol/sapphire-paratime';

/*
// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.2 <0.9.0;
contract Storage {
    uint256 number;
    function store(uint256 num) public {
        number = num;
    }
    function retrieve() public view returns (uint256){
        return number;
    }
}
*/
const StorageBytecode =
  '0x608060405234801561000f575f80fd5b506101438061001d5f395ff3fe608060405234801561000f575f80fd5b5060043610610034575f3560e01c80632e64cec1146100385780636057361d14610056575b5f80fd5b610040610072565b60405161004d919061009b565b60405180910390f35b610070600480360381019061006b91906100e2565b61007a565b005b5f8054905090565b805f8190555050565b5f819050919050565b61009581610083565b82525050565b5f6020820190506100ae5f83018461008c565b92915050565b5f80fd5b6100c181610083565b81146100cb575f80fd5b50565b5f813590506100dc816100b8565b92915050565b5f602082840312156100f7576100f66100b4565b5b5f610104848285016100ce565b9150509291505056fea26469706673582212201bc715d5ea5b4244a667a55f9fd36929a52a02208d9b458fdf543f5495011b2164736f6c63430008180033';

const StorageABI = [
  {
    inputs: [],
    name: 'retrieve',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'num',
        type: 'uint256',
      },
    ],
    name: 'store',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

describe('Provider Integration Test', () => {
  it('Deploys', async () => {
    // Force Ethers to go through a wrapped EIP-1193 provider
    const v = new JsonRpcProvider(NETWORKS.localnet.defaultGateway);
    expect(isLegacyProvider(v)).toBeTruthy();

    const w = Wallet.fromPhrase(
      'test test test test test test test test test test test junk',
      v,
    );
    const wp = wrapEthereumProvider({
      request: (args) => v.send(args.method, args.params ?? []),
    });

    // Check that we can detect that it's a wrapped provider
    expect(isWrappedRequestFn(wp.request)).toBeTruthy();
    expect(isWrappedEthereumProvider(wp)).toBeTruthy();
    expect(wrapEthereumProvider(wp) === wp).toBeTruthy();

    const bp = new BrowserProvider(wp);

    // Make deploy transaction
    const txr = await w.populateTransaction({
      data: StorageBytecode,
    });
    const stx = await w.signTransaction(txr);

    // Wait for successful contract deployment
    const r = await bp.broadcastTransaction(stx);
    const s = await r.wait();
    expect(s).not.toBeNull();
    expect(s?.contractAddress).not.toBeNull();
    expect(s?.contractAddress).not.toBeUndefined();
    if (!s || !s.contractAddress) throw new Error('Oops');

    // Setup contract interface
    const bc = new BaseContract(s!.contractAddress, StorageABI, bp);

    // Verify eth_call works to retrieve existing value
    const receive = bc.getFunction('retrieve');
    const x = await receive();
    expect(x).toBe(0n);

    const expectedValue = 123n;

    // Submit transaction which modifies stored value
    const store = bc.getFunction('store');
    const storeTxRequest = await w.populateTransaction(
      await store.populateTransaction(expectedValue),
    );
    const storeTxRaw = await w.signTransaction(storeTxRequest);
    const storeTx = await bp.broadcastTransaction(storeTxRaw);
    await storeTx.wait();

    // Verify value has been modified
    const z = await receive();
    expect(z).toBe(expectedValue);
  }, 20000);
});
