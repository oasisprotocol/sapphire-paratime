import { expect } from "chai";

import {
	NETWORKS,
	SignerHasNoProviderError,
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

const OmnibusJSON = {
	"_format": "hh-sol-artifact-1",
	"contractName": "Omnibus",
	"sourceName": "contracts/tests/Omnibus.sol",
	"abi": [
	  {
		"inputs": [
		  {
			"internalType": "uint256",
			"name": "value",
			"type": "uint256"
		  }
		],
		"name": "CustomError",
		"type": "error"
	  },
	  {
		"inputs": [
		  {
			"internalType": "uint256",
			"name": "value",
			"type": "uint256"
		  }
		],
		"name": "setSomevar",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	  },
	  {
		"inputs": [],
		"name": "somevar",
		"outputs": [
		  {
			"internalType": "uint256",
			"name": "",
			"type": "uint256"
		  }
		],
		"stateMutability": "view",
		"type": "function"
	  },
	  {
		"inputs": [],
		"name": "testCustomRevert",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	  },
	  {
		"inputs": [],
		"name": "testCustomViewRevert",
		"outputs": [
		  {
			"internalType": "uint256",
			"name": "",
			"type": "uint256"
		  }
		],
		"stateMutability": "pure",
		"type": "function"
	  },
	  {
		"inputs": [],
		"name": "testRevert",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	  },
	  {
		"inputs": [],
		"name": "testSignedQueries",
		"outputs": [
		  {
			"internalType": "address",
			"name": "",
			"type": "address"
		  }
		],
		"stateMutability": "view",
		"type": "function"
	  },
	  {
		"inputs": [
		  {
			"internalType": "uint256",
			"name": "len",
			"type": "uint256"
		  }
		],
		"name": "testViewLength",
		"outputs": [
		  {
			"internalType": "bytes",
			"name": "",
			"type": "bytes"
		  }
		],
		"stateMutability": "pure",
		"type": "function"
	  },
	  {
		"inputs": [],
		"name": "testViewRevert",
		"outputs": [
		  {
			"internalType": "uint256",
			"name": "",
			"type": "uint256"
		  }
		],
		"stateMutability": "pure",
		"type": "function"
	  }
	],
	"bytecode": "0x6080806040523461001657610319908161001c8239f35b600080fdfe60406080815260048036101561001457600080fd5b6000803560e01c8063231985d4146101a2578063252af80814610187578063828e5fe814610168578063987426a61461014a5780639cc065b0146100f2578063a26388bb146100c3578063bface099146100ae5763dcbaab5e1461007757600080fd5b346100ab57806003193601126100ab57506000805160206102c4833981519152602492519163110b365560e01b8352820152fd5b80fd5b50346100ab57806003193601121561028e5780fd5b50346100ab57806003193601126100ab57805460018101101561028e576011602492634e487b7160e01b835252fd5b5091346101465782600319360112610146578260249354600181011061013457506000805160206102c483398151915290519163110b365560e01b8352820152fd5b634e487b7160e01b8152601190925250fd5b8280fd5b509034610164576020366003190112610164573560015580f35b5080fd5b5082346101645781600319360112610164576020906001549051908152f35b50823461016457816003193601126101645760209051338152f35b5091903461014657602092836003193601126100ab5790601f9181356101c78161025d565b85518519959094910185168401906001600160401b0382118583101761024a575084929394916101fb91875280865261025d565b0136868501378351948592818452845191828186015281955b8387106102325750508394508582601f949501015201168101030190f35b86810182015189880189015295810195889550610214565b634e487b7160e01b845260419052602483fd5b6001600160401b03811161027857601f01601f191660200190565b634e487b7160e01b600052604160045260246000fd5b60405162461bcd60e51b815260206004820152600d60248201526c2a3434b9a4b9a0b722b93937b960991b6044820152606490fdfe1023456789abcdef1023456789abcdef1023456789abcdef1023456789abcdefa2646970667358221220c3aa4924c0e0f172810d86bb6d3a363c9f02596db866040081cd7ed4bc7fe64464736f6c63430008140033",
	"deployedBytecode": "0x60406080815260048036101561001457600080fd5b6000803560e01c8063231985d4146101a2578063252af80814610187578063828e5fe814610168578063987426a61461014a5780639cc065b0146100f2578063a26388bb146100c3578063bface099146100ae5763dcbaab5e1461007757600080fd5b346100ab57806003193601126100ab57506000805160206102c4833981519152602492519163110b365560e01b8352820152fd5b80fd5b50346100ab57806003193601121561028e5780fd5b50346100ab57806003193601126100ab57805460018101101561028e576011602492634e487b7160e01b835252fd5b5091346101465782600319360112610146578260249354600181011061013457506000805160206102c483398151915290519163110b365560e01b8352820152fd5b634e487b7160e01b8152601190925250fd5b8280fd5b509034610164576020366003190112610164573560015580f35b5080fd5b5082346101645781600319360112610164576020906001549051908152f35b50823461016457816003193601126101645760209051338152f35b5091903461014657602092836003193601126100ab5790601f9181356101c78161025d565b85518519959094910185168401906001600160401b0382118583101761024a575084929394916101fb91875280865261025d565b0136868501378351948592818452845191828186015281955b8387106102325750508394508582601f949501015201168101030190f35b86810182015189880189015295810195889550610214565b634e487b7160e01b845260419052602483fd5b6001600160401b03811161027857601f01601f191660200190565b634e487b7160e01b600052604160045260246000fd5b60405162461bcd60e51b815260206004820152600d60248201526c2a3434b9a4b9a0b722b93937b960991b6044820152606490fdfe1023456789abcdef1023456789abcdef1023456789abcdef1023456789abcdefa2646970667358221220c3aa4924c0e0f172810d86bb6d3a363c9f02596db866040081cd7ed4bc7fe64464736f6c63430008140033",
	"linkReferences": {},
	"deployedLinkReferences": {}
} as const;

const WELL_KNOWN_WALLET_PRIVATE_KEY =
	"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function verifyTransactionEncryption(contract: Contract) {
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
}

describe("Ethers v6 + Sapphire", () => {
	let wallet1: Wallet;
	let contract: Contract;

	before(async function () {
		this.timeout(10000);

		wallet1 = new Wallet(WELL_KNOWN_WALLET_PRIVATE_KEY);

		const rawProvider1 = new JsonRpcProvider(NETWORKS.localnet.defaultGateway);
		const provider1 = wrapEthersProvider(rawProvider1);

		const cw1 = wallet1.connect(provider1);
		const signer1 = wrapEthersSigner(cw1);

		const factory = new ContractFactory(
			OmnibusJSON.abi,
			OmnibusJSON.bytecode,
			signer1,
		);
		contract = (await factory.deploy()) as Contract;
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

		await verifyTransactionEncryption(contract);
	});

	it("Can't wrap signer without provider", async () => {
		expect(() => wrapEthersSigner(wallet1)).throw(SignerHasNoProviderError);
	});

	it("Doesn't double-wrap providers", () => {
		const rawProvider1 = new JsonRpcProvider(NETWORKS.localnet.defaultGateway);
		const provider1 = wrapEthersProvider(rawProvider1);
		const provider2 = wrapEthersProvider(provider1);
		expect(provider1).to.equal(provider2);
		expect(provider1).to.not.equal(rawProvider1);
	});

	it("Doesn't double-wrap signers", () => {
		const w1 = new Wallet(WELL_KNOWN_WALLET_PRIVATE_KEY);
		const rp = new JsonRpcProvider(NETWORKS.localnet.defaultGateway);
		const x = w1.connect(wrapEthersProvider(rp));
		const y = wrapEthersSigner(x);
		expect(y).to.equal(wrapEthersSigner(y));
	});
});
