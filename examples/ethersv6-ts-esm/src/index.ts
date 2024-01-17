import { wrap } from "@oasisprotocol/sapphire-paratime";

import { ContractFactory, JsonRpcProvider, ethers } from "ethers";

import { TestErc20Token } from "./TestErc20Token.js";
import { assert } from "console";

async function main () {
    const wallet = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');

    const provider = wrap(new JsonRpcProvider('http://127.0.0.1:8545'));



    const signer = wrap(wallet.connect(provider));

    const fac = new ContractFactory(TestErc20Token.abi, TestErc20Token.bytecode, signer);

    console.log('Deploying');
    const contract = await fac.deploy();
    console.log('Waiting for deployment');
    const contractReceipt = await contract.waitForDeployment();
    console.log('Deployed', contractReceipt.deploymentTransaction()?.hash);

    console.log('Calling getAddress');
    const myAddr = await signer.getAddress();

    console.log('Calling mint');
    const mintTx = await contract.getFunction("mint(address,uint256)")(myAddr, 100);
    assert(mintTx.data.length > 100);  // TODO: ensure mintTx has encrypted calldata
    console.log('mintTx', mintTx.hash);
    await mintTx.wait();

    console.log('Calling totalSupply');
    const totalSupply = await contract.getFunction("totalSupply()")() as bigint;
    assert(totalSupply === 100n);
}

await main ();
