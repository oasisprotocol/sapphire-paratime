import { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect, usePublicClient,
         useWaitForTransactionReceipt, useWalletClient } from 'wagmi'
import { writeContract } from 'viem/actions';

const StorageABI = [
  {
    "inputs": [],
    "name": "retrieve",
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
    "inputs": [
      {
        "internalType": "uint256",
        "name": "num",
        "type": "uint256"
      }
    ],
    "name": "store",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

function App() {
  const account = useAccount();
  const { connectors, connect, status, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: walletClient } =  useWalletClient();
  const [deployHash, setDeployHash] = useState<undefined | `0x${string}`>();
  const [contractAddress, setContractAddress] = useState<undefined | `0x${string}`>();
  const [writeTxHash, setWriteTxHash] = useState<undefined | `0x${string}`>();
  const [readResult, setReadResult] = useState<bigint|undefined>();
  const publicClient = usePublicClient();
  const {
    data:deployReceipt,
    error:deployTxError,
  } = useWaitForTransactionReceipt({hash:deployHash, confirmations: 1});

  const {
    data:writeReceipt,
    error:writeTxError,
  } = useWaitForTransactionReceipt({hash:writeTxHash, confirmations: 1});

  async function doDeploy () {
    const hash = await walletClient?.deployContract({
      abi: StorageABI,
      bytecode: '0x608060405234801561000f575f80fd5b506101438061001d5f395ff3fe608060405234801561000f575f80fd5b5060043610610034575f3560e01c80632e64cec1146100385780636057361d14610056575b5f80fd5b610040610072565b60405161004d919061009b565b60405180910390f35b610070600480360381019061006b91906100e2565b61007a565b005b5f8054905090565b805f8190555050565b5f819050919050565b61009581610083565b82525050565b5f6020820190506100ae5f83018461008c565b92915050565b5f80fd5b6100c181610083565b81146100cb575f80fd5b50565b5f813590506100dc816100b8565b92915050565b5f602082840312156100f7576100f66100b4565b5b5f610104848285016100ce565b9150509291505056fea26469706673582212201bc715d5ea5b4244a667a55f9fd36929a52a02208d9b458fdf543f5495011b2164736f6c63430008180033',
      args: []
    });
    if( hash ) {
      console.log('Deploy hash set to', hash);
      setDeployHash(hash);
    }
  }

  useEffect(() => {
    if( deployReceipt?.contractAddress ) {
      setContractAddress(deployReceipt.contractAddress);
    }
  }, [deployReceipt]);

  async function doWrite () {
    if( contractAddress ) {
      const result = await writeContract(walletClient!, {
        account: account.address!,
        abi: StorageABI,
        address: contractAddress,
        functionName: 'store',
        args: [1n]
      });
      setWriteTxHash(result);
    }
  }

  async function doRead () {
    if( contractAddress ) {
      const result = await publicClient.readContract({
        abi: StorageABI,
        address: contractAddress,
        functionName: 'retrieve',
        args: []
      });
      setReadResult(result);
    }
  }

  return (
    <>
      <div>
        <h2>Account</h2>

        <div>
          status: {account.status}
          <br />
          {account.addresses && (<>address: <span id="accountAddress">{account.addresses[0]}</span></>)}
          <br />
          chainId: {account.chainId}
            {account.chain && (
              <span>&nbsp;({account.chain?.name})</span>
            )}
        </div>

        <hr />

        <button type="button" onClick={doDeploy}>
          Deploy
        </button>
        {deployHash}<br />
        {deployTxError && (<>Deploy Error: {deployTxError?.message}<br /></>)}
        {deployReceipt && (<>
          Contract: <span id="deployContractAddress">{deployReceipt?.contractAddress}</span><br />
          <hr />
          <button type="button" onClick={doWrite}>
            Write
          </button><br />
          {writeTxHash && (<>
            Write Tx Hash: {writeTxHash}<br />
            {writeTxError && (<>
              Write Tx Error: {writeTxError.message}<br />
            </>)}
            {writeReceipt && (<>
              Write Tx Gas: {writeReceipt.gasUsed.toString()}<br />
              Write Tx BlockHash: <span id="writeReceiptBlockHash">{writeReceipt.blockHash}</span><br />
            </>)}
          </>)}
          <hr />

          <button type="button" onClick={doRead}>
            Read
          </button>
          {readResult !== undefined && (<>
            <span id="readResult">{readResult.toString()}</span>
          </>)}
          <br />
        </>)}
        <hr />

        {account.status === 'connected' && (
          <button type="button" onClick={() => disconnect()}>
            Disconnect
          </button>
        )}
      </div>

      <div>
        <h2>Connect</h2>
        {connectors.map((connector) => (
          <button
            key={connector.uid}
            onClick={() => connect({ connector })}
            type="button"
            id={"connect-" + connector.id}
          >
            {connector.name}
          </button>
        ))}
        <div>{status}</div>
        <div>{error?.message}</div>
      </div>
    </>
  )
}

export default App
