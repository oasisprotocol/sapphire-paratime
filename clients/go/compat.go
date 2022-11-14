package sapphire

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"encoding/json"
	"math/big"
	"net/http"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/oasisprotocol/emerald-web3-gateway/rpc/oasis"
	"github.com/twystd/tweetnacl-go/tweetnacl"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
)

const DefaultGasLimit = 30_000_000      // Default gas params are assigned in the web3 gateway.
const DefaultGasPrice = 100_000_000_000 // 1 * 100_000_000_000
const DefaultBlockRange = 15

type NetworkParams struct {
	Name           string
	ChainID        big.Int
	DefaultGateway string
	RuntimeID      string
}

var Networks = map[uint64]NetworkParams{
	23295: {
		Name:           "testnet",
		ChainID:        *big.NewInt(23295),
		DefaultGateway: "https://testnet.sapphire.oasis.dev",
		RuntimeID:      "0x000000000000000000000000000000000000000000000000a6d1e3ebf60dff6c",
	},
	23294: {
		Name:           "mainnet",
		ChainID:        *big.NewInt(23294),
		DefaultGateway: "https://sapphire.oasis.dev",
		RuntimeID:      "0x0000000000000000000000000000000000000000000000000000000000000000",
	},
}

type WrappedBackend struct {
	Backend          bind.ContractBackend
	ChainID          big.Int
	Cipher           Cipher
	Key              ecdsa.PrivateKey
	RuntimePublicKey []byte
	TransactOpts     bind.TransactOpts
	Signer           WrappedSigner
}

type WrappedSigner struct {
	SignFn func(digest [32]byte) ([]byte, error)
}

type Request struct {
	Version string      `json:"jsonrpc"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params"`
	ID      int         `json:"id"`
}

type Error struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

type Response struct {
	Error  *Error          `json:"error"`
	ID     int             `json:"id"`
	Result json.RawMessage `json:"result,omitempty"`
}

func addressToByte(addr *common.Address) []byte {
	if addr != nil {
		return addr[:]
	}

	return nil
}

func GetRuntimePublicKey(chainID uint64) ([]byte, error) {
	endpoint := Networks[chainID].DefaultGateway
	request := Request{
		Version: "2.0",
		Method:  "oasis_callDataPublicKey",
		Params:  []string{},
		ID:      1,
	}
	rawReq, _ := json.Marshal(request)

	req, _ := http.NewRequestWithContext(context.Background(), http.MethodPost, endpoint, bytes.NewBuffer(rawReq))
	req.Header.Set("Content-Type", "application/json")

	client := http.Client{}
	res, err := client.Do(req)

	if err != nil {
		return nil, err
	}

	decoder := json.NewDecoder(res.Body)
	rpcRes := new(Response)
	if err := decoder.Decode(&rpcRes); err != nil {
		return nil, err
	}

	if err := res.Body.Close(); err != nil {
		return nil, err
	}

	var pubKey oasis.CallDataPublicKey
	if err := json.Unmarshal(rpcRes.Result, &pubKey); err != nil {
		return nil, err
	}

	return pubKey.PublicKey, nil
}

func NewSigner(signerFn func(digest [32]byte) ([]byte, error)) WrappedSigner {
	return WrappedSigner{
		SignFn: signerFn,
	}
}

func NewWrappedBackend(transactOpts *bind.TransactOpts, chainID *big.Int, privateKey *ecdsa.PrivateKey, cipher *Cipher, signerFn func(digest [32]byte) ([]byte, error)) (*WrappedBackend, error) {
	conn, err := ethclient.Dial(Networks[chainID.Uint64()].DefaultGateway)
	if err != nil {
		return nil, err
	}

	runtimePublicKey, err := GetRuntimePublicKey(chainID.Uint64())

	if err != nil {
		return nil, err
	}

	var backendCipher Cipher

	if cipher == nil {
		publicKey, err := tweetnacl.ScalarMultBase(crypto.FromECDSA(privateKey))

		if err != nil {
			return nil, err
		}

		keypair := tweetnacl.KeyPair{
			PublicKey: publicKey,
			SecretKey: crypto.FromECDSA(privateKey),
		}
		backendCipher, err = NewX255919DeoxysIICipher(keypair, runtimePublicKey)

		if err != nil {
			return nil, err
		}
	} else {
		backendCipher = *cipher
	}

	return &WrappedBackend{
		Backend:          conn,
		ChainID:          *chainID,
		Cipher:           backendCipher,
		Key:              *privateKey,
		RuntimePublicKey: runtimePublicKey,
		TransactOpts:     *transactOpts,
		Signer:           NewSigner(signerFn),
	}, nil
}

func (w WrappedSigner) Sign(digest [32]byte) ([]byte, error) {
	return w.SignFn(digest)
}

func (b WrappedBackend) SendTransaction(ctx context.Context, tx *types.Transaction) error {
	header, err := b.Backend.HeaderByNumber(ctx, nil)
	if err != nil {
		return err
	}

	baseTx, err := NewSapphireTransaction(header, tx, b.Signer, b.TransactOpts.From, b.Cipher)
	if err != nil {
		return err
	}

	signer := types.LatestSignerForChainID(tx.ChainId())
	signature, err := crypto.Sign(signer.Hash(baseTx).Bytes(), &b.Key)
	if err != nil {
		return err
	}

	signedTx, err := baseTx.WithSignature(signer, signature)
	if err != nil {
		return err
	}

	return b.Backend.SendTransaction(ctx, signedTx)
}

func NewSapphireTransaction(header *types.Header, tx *types.Transaction, signer Signer, from common.Address, cipher Cipher) (*types.Transaction, error) {
	blockHash := header.Hash()
	leash := NewLeash(header.Nonce.Uint64(), header.Number.Uint64(), blockHash[:], DefaultBlockRange)

	dataPack, err := NewDataPack(signer, tx.ChainId().Uint64(), from[:], addressToByte(tx.To()), tx.Gas(), tx.GasPrice(), tx.Value(), tx.Data(), leash)
	if err != nil {
		return nil, err
	}

	legacyTx := &types.LegacyTx{
		To:       tx.To(),
		Nonce:    tx.Nonce(),
		GasPrice: tx.GasPrice(),
		Gas:      DefaultGasLimit,
		Value:    tx.Value(),
		Data:     dataPack.EncryptEncode(cipher),
	}

	return types.NewTx(legacyTx), nil
}

func packContractCall(header *types.Header, call *ethereum.CallMsg, chainID uint64, signer Signer, cipher Cipher) error {
	blockHash := header.Hash()
	leash := NewLeash(header.Nonce.Uint64(), header.Number.Uint64(), blockHash[:], DefaultBlockRange)

	dataPack, err := NewDataPack(signer, chainID, call.From[:], addressToByte(call.To), DefaultGasLimit, call.GasPrice, call.Value, call.Data, leash)

	if err != nil {
		return err
	}

	call.Data = dataPack.EncryptEncode(cipher)

	return nil
}

func (b WrappedBackend) CallContract(ctx context.Context, call ethereum.CallMsg, blockNumber *big.Int) ([]byte, error) {
	header, err := b.Backend.HeaderByNumber(ctx, blockNumber)

	if err != nil {
		return nil, err
	}

	if err = packContractCall(header, &call, b.ChainID.Uint64(), b.Signer, b.Cipher); err != nil {
		return nil, err
	}

	res, err := b.Backend.CallContract(ctx, call, blockNumber)

	if err != nil {
		return nil, err
	}

	return b.Cipher.DecryptEncoded(res)
}

func (b WrappedBackend) CodeAt(ctx context.Context, contract common.Address, blockNumber *big.Int) ([]byte, error) {
	return b.Backend.CodeAt(ctx, contract, blockNumber)
}

// Return Sapphire default gas limit.
func (b WrappedBackend) EstimateGas(ctx context.Context, call ethereum.CallMsg) (gas uint64, err error) {
	return DefaultGasLimit, nil
	// TODO: re-enable
	// header, err := b.Backend.HeaderByNumber(ctx, blockNumber)

	// if err != nil {
	// 	return nil, err
	// }

	// if err = packContractCall(header, &call, b.ChainID.Uint64(), b.Signer, b.Cipher); err != nil {
	// 	return nil, err
	// }

	// return b.Backend.EstimateGas(ctx, call)
}

func (b WrappedBackend) FilterLogs(ctx context.Context, query ethereum.FilterQuery) ([]types.Log, error) {
	return b.Backend.FilterLogs(ctx, query)
}

func (b WrappedBackend) HeaderByNumber(ctx context.Context, number *big.Int) (*types.Header, error) {
	return b.Backend.HeaderByNumber(ctx, number)
}

func (b WrappedBackend) PendingCodeAt(ctx context.Context, account common.Address) ([]byte, error) {
	return b.Backend.PendingCodeAt(ctx, account)
}

func (b WrappedBackend) PendingNonceAt(ctx context.Context, account common.Address) (uint64, error) {
	return b.Backend.PendingNonceAt(ctx, account)
}

// Return Sapphire default gas price.
func (b WrappedBackend) SuggestGasPrice(ctx context.Context) (*big.Int, error) {
	return big.NewInt(DefaultGasPrice), nil
	// TODO: re-enable
	// return b.Backend.SuggestGasPrice(ctx)
}

func (b WrappedBackend) SuggestGasTipCap(ctx context.Context) (*big.Int, error) {
	return b.Backend.SuggestGasTipCap(ctx)
}

func (b WrappedBackend) SubscribeFilterLogs(ctx context.Context, query ethereum.FilterQuery, ch chan<- types.Log) (ethereum.Subscription, error) {
	return b.Backend.SubscribeFilterLogs(ctx, query, ch)
}
