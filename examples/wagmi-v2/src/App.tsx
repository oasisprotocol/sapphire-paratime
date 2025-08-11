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
} from "wagmi";
import { isCalldataEnveloped } from "@oasisprotocol/sapphire-paratime";
import type { Abi } from "abitype";

const { PROD } = import.meta.env;

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

const AccountInfo: FC<{ account: ReturnType<typeof useAccount> }> = ({
	account,
}) => (
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
			Chain ID: {account.chainId}
			{account.chain && <span> ({account.chain.name})</span>}
		</div>
	</div>
);

const DeploySection: FC<{
	onDeploy: () => void;
	deployHash: TxHash;
	deployError: Error | null;
	contractAddress: TxHash;
	isDeploying?: boolean;
}> = ({ onDeploy, deployHash, deployError, contractAddress, isDeploying }) => (
	<div>
		<button type="button" onClick={onDeploy} disabled={isDeploying}>
			{isDeploying ? "Deploying..." : "Deploy Contract"}
		</button>
		{deployHash && (
			<div>
				Deploy Hash: <code>{deployHash}</code>
			</div>
		)}
		{deployError && (
			<div style={{ color: "red" }}>Deploy Error: {deployError.message}</div>
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

const WriteSection: FC<{
	onWrite: () => void;
	writeTxHash: TxHash;
	writeTxInfo: any;
	disabled: boolean;
	isWriting?: boolean;
}> = ({ onWrite, writeTxHash, writeTxInfo, disabled, isWriting }) => (
	<div>
		<button type="button" onClick={onWrite} disabled={disabled || isWriting}>
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

const ReadSection: FC<{
	onRead: () => Promise<void>;
	readResult: bigint | undefined;
	disabled: boolean;
}> = ({ onRead, readResult, disabled }) => (
	<div>
		<button type="button" onClick={onRead} disabled={disabled}>
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

const ConnectSection: FC<{
	children: React.ReactNode;
	status: string;
	error: Error | null;
	account: ReturnType<typeof useAccount>;
	onDisconnect: () => void;
}> = ({ children, status, error, account, onDisconnect }) => (
	<div>
		<h2>Connect Wallet</h2>
		{children}
		<div>Status: {status}</div>
		{error && <div style={{ color: "red" }}>{error.message}</div>}
		{account.status === "connected" && (
			<button type="button" onClick={onDisconnect}>
				Disconnect
			</button>
		)}
	</div>
);

export const App: FC<PropsWithChildren> = ({ children }) => {
	const account = useAccount();
	const { status, error } = useConnect();
	const { disconnect } = useDisconnect();
	const publicClient = usePublicClient();

	const [contractAddress, setContractAddress] = useState<TxHash>(() => {
		const stored = localStorage.getItem("contractAddress");
		return stored ? (stored as TxHash) : undefined;
	});

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

	const [readResult, setReadResult] = useState<bigint | undefined>();

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

	const isWriting = isWriteTxPending || (writeTxHash && !writeTxInfo);

	return (
		<div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
			<AccountInfo account={account} />

			{account.status === "connected" && (
				<>
					<hr />
					<DeploySection
						onDeploy={handleDeploy}
						deployHash={deployHash}
						deployError={deployTxError ?? deployError}
						contractAddress={contractAddress}
						isDeploying={isDeploying}
					/>
				</>
			)}

			{contractAddress && (
				<>
					<hr />
					<WriteSection
						onWrite={handleWrite}
						writeTxHash={writeTxHash}
						writeTxInfo={writeTxInfo}
						disabled={!contractAddress}
						isWriting={isWriting}
					/>

					<hr />
					<ReadSection
						onRead={handleRead}
						readResult={readResult}
						disabled={!contractAddress}
					/>
				</>
			)}

			<hr />
			<ConnectSection
				status={status}
				error={error}
				account={account}
				onDisconnect={disconnect}
			>
				{children}
			</ConnectSection>

			{!PROD && (
				<div style={{ fontSize: "12px", color: "red", marginTop: "10px" }}>
					___DEBUG___
					<br />
					<br />
					isWriteTxPending={String(isWriteTxPending)}
					<br />
					writeTxHash={writeTxHash || "undefined"}
					<br />
					writeTxReceipt={writeTxReceipt?.transactionHash || "undefined"}
					<br />
					contractAddress={contractAddress || "undefined"}
					<br />
				</div>
			)}
		</div>
	);
};

export default App;
