import { Web3 } from 'web3';
import { TestErc20Token } from "./TestErc20Token.js";
import { assert } from 'console';
import { wrap } from "@oasisprotocol/sapphire-paratime";

async function main () {

    const provider = new Web3.providers.HttpProvider('http://127.0.0.1:3000');
    const wrappedProvider = wrap(provider);
    const signer = new Web3(wrappedProvider);

    const account = signer.eth.accounts.wallet.add('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80').get(0)!;
    console.log('account', account.address);

    const contract = new signer.eth.Contract(TestErc20Token.abi, undefined, {
        gasPrice: '100000000000',
        from: account.address
    });

    const deployed = await contract.deploy({
        data: TestErc20Token.bytecode
    }).send({
        gas: '1185560'
    });
    console.log('deployed', deployed.options.address);

    const mintTx = await deployed.methods.mint(account.address, 100n).send();
    console.log('mintTx', mintTx.transactionHash);

    const totalSupply = await deployed.methods.totalSupply().call()
    assert(totalSupply === 100n);
}

await main ();
