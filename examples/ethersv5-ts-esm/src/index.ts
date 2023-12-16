import { wrap } from "@oasisprotocol/sapphire-paratime";

import { BigNumber, ContractFactory, ethers } from "ethers";

import { TestErc20Token } from "./TestErc20Token.js";
import { assert } from "console";

async function main () {
    const wallet = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');

    const provider = new ethers.providers.JsonRpcProvider({
        url: 'http://127.0.0.1:8545',
    });

    const signer = wallet.connect(provider);

    const fac = new ContractFactory(TestErc20Token.abi, TestErc20Token. bytecode, signer);

    const contract = await fac.deploy();
    await contract.deployed();

    const myAddr = await signer.getAddress();

    const ws = wrap(signer);
    const signerContract = contract.connect(ws);
    const mintTx = await signerContract["mint(address,uint256)"](myAddr, 100) as ethers.providers.TransactionResponse;
    assert(mintTx.data.length > 100);  // TODO: ensure mintTx has encrypted calldata
    await mintTx.wait();

    const wp = wrap(provider);
    const providerContract = contract.connect(wp);
    const totalSupply = await providerContract["totalSupply()"]() as BigNumber;
    assert(totalSupply.eq(100));
}

await main ();

