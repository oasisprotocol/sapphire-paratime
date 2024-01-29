import { wrapEthersSigner, wrapEthersProvider, wrap } from "@oasisprotocol/sapphire-paratime";

import { ContractFactory, JsonRpcProvider, BaseContract, Wallet, ZeroAddress } from "ethers";

import { assert } from "console";

import OmnibusJSON from "../../../contracts/artifacts/contracts/tests/Omnibus.sol/Omnibus.json" assert { type: "json" };

async function testTheContract(contract:BaseContract, signerAddr?:string)
{
    const addr = await contract.getFunction("testSignedQueries()")();
    if( signerAddr ) {
        assert( addr === signerAddr );
    }
    else {
        assert( addr === ZeroAddress );
    }

    try {
        await contract.getFunction("testCustomRevert()").staticCall();
        assert(false);
    }
    catch(e:any) {
        assert(e.code === 'CALL_EXCEPTION');
        assert(e.revert.name === 'CustomError');
        assert(e.revert.args[0] === '0x1023456789abcdef1023456789abcdef1023456789abcdef1023456789abcdef');
    }
}

async function main () {
    const wallet1 = new Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');

    const rawProvider1 = new JsonRpcProvider('http://127.0.0.1:8545');
    const provider1 = wrapEthersProvider(rawProvider1);

    const rawProvider2 = new JsonRpcProvider('http://127.0.0.1:8545');

    const signer1 = wrapEthersSigner(wallet1.connect(provider1));

    const fac = new ContractFactory(OmnibusJSON.abi, OmnibusJSON.bytecode, signer1);

    const contract = await fac.deploy();
    const contractReceipt = await contract.waitForDeployment();
    console.log('Deployed', contractReceipt.deploymentTransaction()?.hash);

    const signerAddr1 = await signer1.getAddress();

    // signed queries will work
    await testTheContract(contract, signerAddr1);

    const mkf = (x:any) => new ContractFactory(OmnibusJSON.abi, OmnibusJSON.bytecode, x);

    // Connect wallet to rawProvider, signed queries will work
    await testTheContract(
        mkf(wrapEthersSigner(wallet1.connect(rawProvider1)))
            .attach(await contract.getAddress()),
        signerAddr1);

    // Use `wrap` instead of `wrapEthersSigner`
    await testTheContract(
        mkf(wrap(wallet1.connect(rawProvider1)))
            .attach(await contract.getAddress()),
        signerAddr1);

    // wrapped provider, msg.sender == ZeroAddress
    await testTheContract(
        mkf(provider1)
            .attach(await contract.getAddress()));

    // Switch the signer to a different provider
    await testTheContract(
        mkf(signer1.connect(rawProvider2))
            .attach(await contract.getAddress()),
        signerAddr1);
}

await main ();
