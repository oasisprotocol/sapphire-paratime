import { FC, PropsWithChildren, useEffect, useState } from "react";
import {
	useAccount,
	useConnect,
	useDeployContract,
	useDisconnect,
	usePublicClient,
	useTransaction,
	useWaitForTransactionReceipt,
	useWriteContract,
	useSwitchChain,
} from "wagmi";
import { isCalldataEnveloped } from "@oasisprotocol/sapphire-paratime";
import type { Abi } from "abitype";

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

// Storage Contract ABI and Bytecode
const STORAGE_BYTECODE =
	"0x608060405234801561000f575f80fd5b506101438061001d5f395ff3fe608060405234801561000f575f80fd5b5060043610610034575f3560e01c80632e64cec1146100385780636057361d14610056575b5f80fd5b610040610072565b60405161004d919061009b565b60405180910390f35b610070600480360381019061006b91906100e2565b61007a565b005b5f8054905090565b805f8190555050565b5f819050919050565b61009581610083565b82525050565b5f6020820190506100ae5f83018461008c565b92915050565b5f80fd5b6100c181610083565b81146100cb575f80fd5b50565b5f813590506100dc816100b8565b92915050565b5f602082840312156100f7576100f66100b4565b5b5f610104848285016100ce565b9150509291505056fea26469706673582212201bc715d5ea5b4244a667a55f9fd36929a52a02208d9b458fdf543f5495011b2164736f6c63430008180033";

const STORAGE_ABI = [
	{
		inputs: [],
		name: "retrieve",
		outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [{ internalType: "uint256", name: "num", type: "uint256" }],
		name: "store",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
] as const satisfies Abi;

type TxHash = `0x${string}` | undefined;

const AccountInfo: FC = () => {
	const account = useAccount();

	return (
		<div>
			<h2>Account</h2>
			<div>
				Status: {account.status}
				<br />
				{account.addresses && (
					<>
						Address: <span id="accountAddress">{account.addresses[0]}</span>
						<br />
					</>
				)}
        {account.connector && (
          <>
            Connector: <span id="connectorName">{account.connector.name}</span>
            <br />
          </>
        )}
        Chain ID: {account.chainId}
				{account.chain && <span> ({account.chain.name})</span>}
			</div>
		</div>
	);
};

const NetworkSection: FC = () => {
	const account = useAccount();
	const { switchChain, chains, isPending, error } = useSwitchChain();

	return (
		<div>
			<h3>Network</h3>
			<div>
				Current: {account.chain?.name ?? "Unknown"} (ID: {account.chainId})
			</div>
			<div style={{ marginTop: "10px" }}>
				<label htmlFor="network-select">Switch to: </label>
				<select
					id="network-select"
					onChange={(e) => {
						const chainId = parseInt(e.target.value);
						if (chainId && switchChain) {
							switchChain({ chainId });
						}
					}}
					disabled={isPending}
					value={account.chainId || ""}
				>
					<option value="">Select network...</option>
					{chains.map((chain) => (
						<option
							key={chain.id}
							value={chain.id}
							disabled={account.chainId === chain.id}
						>
							{chain.name} {account.chainId === chain.id ? "(current)" : ""}
						</option>
					))}
				</select>
			</div>
			{isPending && <div>Switching network...</div>}
			{error && (
				<div style={{ color: "red", marginTop: "5px" }}>
					Network Error: {error.message}
				</div>
			)}
		</div>
	);
};

const DeploySection: FC = () => {
	const [contractAddress, setContractAddress] = useState<TxHash>(() => {
		const stored = localStorage.getItem("contractAddress");
		return stored ? (stored as TxHash) : undefined;
	});

	const {
		deployContract,
		data: deployHash,
		isPending: isDeploying,
		error: deployError,
	} = useDeployContract();

	const { data: deployReceipt, error: deployTxError } =
		useWaitForTransactionReceipt({
			hash: deployHash,
			confirmations: 1,
			query: {
				enabled: !!deployHash,
			},
		});

	useEffect(() => {
		if (contractAddress) {
			localStorage.setItem("contractAddress", contractAddress);
		}
	}, [contractAddress]);

	useEffect(() => {
		if (deployReceipt?.contractAddress) {
			setContractAddress(deployReceipt.contractAddress);
		}
	}, [deployReceipt]);

	const handleDeploy = (): void => {
		try {
			deployContract({
				abi: STORAGE_ABI,
				bytecode: STORAGE_BYTECODE,
				args: [],
			});
		} catch (error) {
			console.error("Deploy error:", error);
		}
	};

	return (
		<div>
			<h3>Deploy Contract</h3>
			<button type="button" onClick={handleDeploy} disabled={isDeploying}>
				{isDeploying ? "Deploying..." : "Deploy Contract"}
			</button>
			{deployHash && (
				<div>
					Deploy Hash: <code>{deployHash}</code>
				</div>
			)}
			{(deployTxError ?? deployError) && (
				<div style={{ color: "red" }}>
					Deploy Error: {(deployTxError ?? deployError)?.message}
				</div>
			)}
			{contractAddress && (
				<div>
					Contract Address:{" "}
					<span id="deployContractAddress">
						<code>{contractAddress}</code>
					</span>
				</div>
			)}
		</div>
	);
};

const WriteSection: FC<{ contractAddress: TxHash }> = ({ contractAddress }) => {
	const {
		writeContract,
		data: writeTxHash,
		isPending: isWriteTxPending,
	} = useWriteContract();

	const { data: writeTxReceipt } = useWaitForTransactionReceipt({
		hash: writeTxHash,
		confirmations: 1,
		query: {
			enabled: !!writeTxHash,
		},
	});

	const { data: writeTxInfo } = useTransaction({
		hash: writeTxHash,
		query: {
			enabled: !!writeTxHash && !!writeTxReceipt,
		},
	});

	const handleWrite = (): void => {
		if (!contractAddress) return;

		try {
			const randomValue = BigInt(Math.round(Math.random() * 100000));
			console.log("Writing value:", randomValue.toString());

			writeContract({
				address: contractAddress,
				abi: STORAGE_ABI,
				functionName: "store",
				args: [randomValue],
			});
		} catch (error) {
			console.error("Write error:", error);
		}
	};

	const isWriting = isWriteTxPending || (writeTxHash && !writeTxInfo);

	return (
		<div>
			<h3>Write to Contract</h3>
			<button
				type="button"
				onClick={handleWrite}
				disabled={!contractAddress || isWriting}
			>
				{isWriting ? "Writing..." : "Write to Contract"}
			</button>
			{writeTxHash && (
				<div>
					<div>
						Write Tx Hash: <code>{writeTxHash}</code>
					</div>
					{writeTxInfo && (
						<div>
							<div>
								Block Hash:{" "}
								<span id="writeReceiptBlockHash">
									<code>{writeTxInfo.blockHash}</code>
								</span>
							</div>
							<div>
								Calldata:{" "}
								<span id="isWriteEnveloped" data-testid="is-write-enveloped">
									{isCalldataEnveloped(writeTxInfo?.input)
										? "encrypted"
										: "plaintext"}
								</span>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
};

const ReadSection: FC<{ contractAddress: TxHash }> = ({ contractAddress }) => {
	const publicClient = usePublicClient();
	const [readResult, setReadResult] = useState<bigint | undefined>();

	const handleRead = async (): Promise<void> => {
		if (!contractAddress || !publicClient) return;

		try {
			const result = await publicClient.readContract({
				abi: STORAGE_ABI,
				address: contractAddress,
				functionName: "retrieve",
				args: [],
			});
			setReadResult(result);
		} catch (error) {
			console.error("Read error:", error);
		}
	};

	return (
		<div>
			<h3>Read from Contract</h3>
			<button type="button" onClick={handleRead} disabled={!contractAddress}>
				Read from Contract
			</button>
			{readResult !== undefined && (
				<div>
					Result:{" "}
					<span id="readResult" data-testid="read-result">
						{readResult.toString()}
					</span>
				</div>
			)}
		</div>
	);
};

const ConnectSection: FC<{ children: React.ReactNode }> = ({ children }) => {
	const { status, error } = useConnect();
	const { disconnect } = useDisconnect();
	const account = useAccount();

	return (
		<div>
			<h2>Connect Wallet</h2>
			{children}
			<div>Status: {status}</div>
			{error && <div style={{ color: "red" }}>{error.message}</div>}
			{account.status === "connected" && (
				<button type="button" onClick={() => disconnect()}>
					Disconnect
				</button>
			)}
		</div>
	);
};

export const App: FC<PropsWithChildren> = ({ children }) => {
	const account = useAccount();
  const [contractAddress, setContractAddress] = useState<TxHash>(() => {
		const stored = localStorage.getItem("contractAddress");
		return stored ? (stored as TxHash) : undefined;
	});

  useEffect(() => {
		const handleStorageChange = () => {
			const stored = localStorage.getItem("contractAddress");
			setContractAddress(stored ? (stored as TxHash) : undefined);
		};

		window.addEventListener("storage", handleStorageChange);

		// Poll for changes since localStorage events don't fire in the same tab
		const interval = setInterval(() => {
			const stored = localStorage.getItem("contractAddress");
			const current = stored ? (stored as TxHash) : undefined;
			if (current !== contractAddress) {
				setContractAddress(current);
			}
		}, 100);

		return () => {
			window.removeEventListener("storage", handleStorageChange);
			clearInterval(interval);
		};
	}, [contractAddress]);

	return (
		<div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
			<AccountInfo />

			{account.status === "connected" && (
				<>
					<hr />
					<NetworkSection />
					<hr />
					<DeploySection />
				</>
			)}

			{contractAddress && (
				<>
					<hr />
					<WriteSection contractAddress={contractAddress} />

					<hr />
					<ReadSection contractAddress={contractAddress} />
				</>
			)}

			<hr />
			<ConnectSection>{children}</ConnectSection>
		</div>
	);
};

export default App;
