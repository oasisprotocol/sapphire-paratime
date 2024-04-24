import { expect } from "chai";

import {
	NETWORKS,
	wrapEthersProvider,
	wrapEthersSigner,
} from "@oasisprotocol/sapphire-ethers-v6";

import {
	type Contract,
	ContractFactory,
	JsonRpcProvider,
	Wallet,
	ZeroAddress,
	isError,
} from "ethers";

import { isCalldataEnveloped } from "@oasisprotocol/sapphire-paratime";

import OmnibusJSON from "../../../contracts/artifacts/contracts/tests/Omnibus.sol/Omnibus.json" assert {
	type: "json",
};

describe("Ethers v6 + Sapphire", () => {
	let wallet1: Wallet;
	let contract: Contract;

	before(async function () {
		this.timeout(10000);

		wallet1 = new Wallet(
			"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
		);

		const rawProvider1 = new JsonRpcProvider(NETWORKS.localnet.defaultGateway);
		const provider1 = wrapEthersProvider(rawProvider1);

		const cw1 = wallet1.connect(provider1);
		const signer1 = wrapEthersSigner(cw1);

		const fac = new ContractFactory(
			OmnibusJSON.abi,
			OmnibusJSON.bytecode,
			signer1,
		);
		contract = (await fac.deploy()) as Contract;
		await contract.waitForDeployment();
	});

	it("Signed queries are not enabled", async () => {
		const addr = await contract.getFunction("testSignedQueries()")();
		expect(addr).to.eq(ZeroAddress);
	});

	it("Revert with reason", async function () {
		this.timeout(10000);

		// Verifies that calling a function which does require(false,"ThisIsAnError")
		// Will return the correct error message in the exception to Ethers
		try {
			await contract.getFunction("testViewRevert()").staticCall();
			// We expect exception to be caught!
			expect(false).to.eq(true);
		} catch (e: unknown) {
			expect(isError(e, "CALL_EXCEPTION")).eq(true);
			if (isError(e, "CALL_EXCEPTION")) {
				expect(e.reason).to.eq("ThisIsAnError");
			}
		}
	});

	it("Custom revert error struct", async function () {
		this.timeout(10000);

		// Verifies that calling a function which does revert CustomError(someInteger)
		// Will return the correctly encoded custom error type to Ethers
		try {
			await contract.getFunction("testCustomRevert()").staticCall();
			// We expect exception to be caught!
			expect(false).to.eq(true);
		} catch (e: unknown) {
			expect(isError(e, "CALL_EXCEPTION")).eq(true);
			if (isError(e, "CALL_EXCEPTION")) {
				expect(e.revert).to.not.be.null;
				if (e.revert) {
					expect(e.revert.name).to.eq("CustomError");
					expect(e.revert.args[0]).to.eq(
						0x1023456789abcdef1023456789abcdef1023456789abcdef1023456789abcdefn,
					);
				}
			}
		}
	});

	it("Encrypts Transactions", async function () {
		this.timeout(10000);

		const newValue = BigInt(Math.round(Math.random() * 100000));

		const oldValue = await contract.getFunction("somevar()").staticCall();
		expect(oldValue).not.eq(newValue);
		expect(oldValue).eq(0n);

		// Then verify we can set some var and it's encrypted
		const f = contract.getFunction("setSomevar(uint256)");
		const r = await f.send(newValue);
		expect(isCalldataEnveloped(r.data)).to.be.true;
		await r.wait();

		const v2 = await contract.getFunction("somevar()").staticCall();
		expect(v2).not.eq(oldValue);
		expect(v2).eq(newValue);
	});
});
