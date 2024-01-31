// import { wrap } from "@oasisprotocol/sapphire-paratime";
import { http, createWalletClient, Hex } from 'viem';

import OmnibusJSON from "../../../contracts/artifacts/contracts/tests/Omnibus.sol/Omnibus.json" assert { type: "json" };
import { privateKeyToAccount } from "viem/accounts";

const LOCAL_NET = {
  id: 23293,
  name: 'Oasis Sapphire Testnet',
  network: 'sapphire-testnet',
  nativeCurrency: { name: 'Sapphire Test Rose', symbol: 'TEST', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['http://127.0.0.1:8545'],
    },
    public: {
      http: ['http://127.0.0.1:8545'],
    },
  },
  testnet: true,
};

async function main () {
  const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  const provider = http('http://127.0.0.1:8545');

  // TODO actually wrap provider or use integration to extend client
  // const wrapped = wrap(provider as EIP1193Provider);
  const walletClient = createWalletClient({ 
    account,
    chain: LOCAL_NET,
    transport: provider
  });

  const hash = await walletClient.deployContract({
    abi: OmnibusJSON.abi,
    account: account.address,
    chain: LOCAL_NET,
    bytecode: OmnibusJSON.bytecode as Hex,
  });

  console.log(hash)

  // TODO migrate additional ethers integration tests over
}

await main ();
