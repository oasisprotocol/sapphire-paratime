import { wrapEthersProvider, wrapEthersSigner, wrap } from "@oasisprotocol/sapphire-paratime";

import { ContractFactory, Wallet, providers, Contract, ethers } from "ethers";

import { assert } from "console";

import OmnibusJSON from "../../../contracts/artifacts/contracts/tests/Omnibus.sol/Omnibus.json" assert { type: "json" };

async function testTheContract(contract:Contract, signerAddr?:string)
{
    const addr = await contract.callStatic["testSignedQueries()"]!();
    if( signerAddr ) {
        assert( addr == signerAddr );
    }
    else {
        assert( addr == ethers.constants.AddressZero );
    }

    // XXX: Note that Ethers v5 has a 'workaround' that confuses types
    //      it makes no distinction between a reverted call returning reversion data
    //      vs a sucessful call return data with the expected return type.
    /*
    try {
        await contract.callStatic['testCustomRevert()']!();
        assert(false);
    }
    catch(e:any) {
        console.log(e);
        assert(e.code == 'CALL_EXCEPTION');
        assert(e.errorName == 'CustomError');
        assert((e.errorArgs[0] as BigNumber).toHexString()  == '0x1023456789abcdef1023456789abcdef1023456789abcdef1023456789abcdef');
    }
    */
}

async function main () {
    const wallet1 = new Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');

    const rawProvider1 = new providers.JsonRpcProvider('http://127.0.0.1:8545');
    const provider1 = wrapEthersProvider(rawProvider1);

    const rawProvider2 = new providers.JsonRpcProvider('http://127.0.0.1:8545');

    const signer1 = wrapEthersSigner(wallet1.connect(provider1));

    const fac = new ContractFactory(OmnibusJSON.abi, OmnibusJSON.bytecode, signer1);

    const contract = await fac.deploy();
    const contractReceipt = await contract.deployed();
    console.log('Deployed', contractReceipt.deployTransaction.hash);

    const signerAddr1 = await signer1.getAddress();

    // signed queries will work
    await testTheContract(contract, signerAddr1);

    const mkf = (x:any) => new ContractFactory(OmnibusJSON.abi, OmnibusJSON.bytecode, x);

    // Connect wallet to rawProvider, signed queries will work
    await testTheContract(
        mkf(wrapEthersSigner(wallet1.connect(rawProvider1)))
            .attach(contract.address),
        signerAddr1);

    // Use `wrap` instead of `wrapEthersSigner`
    await testTheContract(
        mkf(wrap(wallet1.connect(rawProvider1)))
            .attach(contract.address),
        signerAddr1);

    // wrapped provider, msg.sender == ZeroAddress
    //testTheContract(          // XXX: Note ethers v5 can't attach contract to provider, only signer!
    //    mkf(provider1)
    //        .attach(contract.address));

    // Switch the signer to a different provider
    await testTheContract(
        mkf(signer1.connect(rawProvider2))
            .attach(contract.address),
        signerAddr1);
}

await main ();
