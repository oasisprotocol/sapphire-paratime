import { Hex, createWalletClient, getContract, http, publicActions } from 'viem';

import OmnibusJSON from "../../../contracts/artifacts/contracts/tests/Omnibus.sol/Omnibus.json" assert { type: "json" };
import { narrow } from 'abitype'
import { privateKeyToAccount } from "viem/accounts";
import { sapphireLocalnet, wrapWalletClient } from '@oasisprotocol/sapphire-viem';


async function main () {
  const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');

  const transport = http('http://127.0.0.1:3000');

  const walletClient = wrapWalletClient(createWalletClient({
    account,
    chain: sapphireLocalnet,
    transport
  }));

  const hash = await walletClient.deployContract({
    abi: narrow(OmnibusJSON.abi),
    bytecode: OmnibusJSON.bytecode as Hex,
  });

  const pc = walletClient.extend(publicActions);
  const receipt = await pc.waitForTransactionReceipt({hash});
  console.log('Receipt', receipt);

  const contractAddress = receipt.contractAddress!;

  console.log('getContract')
  const c = getContract({
    address: contractAddress,
    abi: narrow(OmnibusJSON.abi),
    client: walletClient
  })
  const x = await c.read['testSignedQueries']!();
  console.log(x);
}

await main ();
