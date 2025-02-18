package sapphire

import (
	"context"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"

	"github.com/oasisprotocol/oasis-core/go/common/cbor"
	"github.com/oasisprotocol/oasis-sdk/client-sdk/go/modules/evm"
	sdkTypes "github.com/oasisprotocol/oasis-sdk/client-sdk/go/types"
)

const (
	DefaultGasPrice   = 100_000_000_000
	DefaultGasLimit   = 30_000_000
	DefaultBlockRange = 15
)

// SignerFn is a function that produces secp256k1 signatures in RSV format.
type SignerFn = func(digest [32]byte) ([]byte, error)

type NetworkParams struct {
	Name           string
	ChainID        big.Int
	DefaultGateway string
	RuntimeID      string
}

var Networks = map[uint64]NetworkParams{
	0x5aff: {
		Name:           "testnet",
		ChainID:        *big.NewInt(0x5aff),
		DefaultGateway: "https://testnet.sapphire.oasis.io",
		RuntimeID:      "0x000000000000000000000000000000000000000000000000a6d1e3ebf60dff6c",
	},
	0x5afe: {
		Name:           "mainnet",
		ChainID:        *big.NewInt(0x5afe),
		DefaultGateway: "https://sapphire.oasis.io",
		RuntimeID:      "0x000000000000000000000000000000000000000000000000f80306c9858e7279",
	},
	0x5afd: {
		Name:           "localnet",
		ChainID:        *big.NewInt(0x5afd),
		DefaultGateway: "http://localhost:8545",
		RuntimeID:      "0x8000000000000000000000000000000000000000000000000000000000000000",
	},
}

// PackTx prepares a regular Eth transaction for Sapphire. The transaction returned from this function is what must be signed.
func PackTx(tx *types.Transaction, cipher Cipher) (*types.Transaction, error) {
	if !txNeedsPacking(tx) {
		return tx, nil
	}
	return packTx(tx, cipher)
}

func packTx(tx *types.Transaction, cipher Cipher) (*types.Transaction, error) {
	return types.NewTx(&types.LegacyTx{
		Nonce:    tx.Nonce(),
		GasPrice: tx.GasPrice(),
		Gas:      tx.Gas(),
		To:       tx.To(),
		Value:    tx.Value(),
		Data:     cipher.EncryptEncode(tx.Data()),
	}), nil
}

// PackCall prepares `msg` for being sent to Sapphire. The call will be end-to-end encrypted, but the `from` address will be zero.
func PackCall(msg ethereum.CallMsg, cipher Cipher) (*ethereum.CallMsg, error) {
	msg.Data = cipher.EncryptEncode(msg.Data)
	return &msg, nil
}

type rsvSigner struct {
	sign SignerFn
}

func (s rsvSigner) SignRSV(digest [32]byte) ([]byte, error) {
	return s.sign(digest)
}

// PackSignedCall prepares `msg` in-place for being sent to Sapphire. The call will be end-to-end encrypted and a signature will be used to authenticate the `from` address.
func PackSignedCall(msg ethereum.CallMsg, cipher Cipher, sign SignerFn, chainID big.Int, leash *evm.Leash) (*ethereum.CallMsg, error) {
	if msg.Gas == 0 {
		msg.Gas = DefaultGasLimit // Must be non-zero for signed calls.
	}
	if msg.GasPrice == nil {
		msg.GasPrice = big.NewInt(DefaultGasPrice) // Must be non-zero for signed calls.
	}
	// msg.To is nil when deploying.
	var to []byte
	if msg.To != nil {
		to = msg.To[:]
	}
	dataPack, err := evm.NewSignedCallDataPack(rsvSigner{sign}, chainID.Uint64(), msg.From[:], to, msg.Gas, msg.GasPrice, msg.Value, msg.Data, *leash)
	if err != nil {
		return nil, fmt.Errorf("failed to create signed call data back: %w", err)
	}

	if dataPack.Data.Body != nil {
		var bodyDecoded []byte
		if err = cbor.Unmarshal(dataPack.Data.Body, &bodyDecoded); err != nil {
			return nil, fmt.Errorf("failed to decode data body while packing signed call: %w", err)
		}
		dataPack.Data = *cipher.EncryptEnvelope(bodyDecoded)
	}
	msg.Data = cbor.Marshal(dataPack)

	return &msg, nil
}

// WrappedBackend implements bind.ContractBackend and bind.DeployBackend.
type WrappedBackend struct {
	backend       bind.ContractBackend
	deployBackend bind.DeployBackend
	chainID       big.Int
	cipher        Cipher
	sign          SignerFn
}

// NewCipher creates a default cipher with encryption support.
//
// If you use cipher over a longer period of time, you should create a new
// cipher instance every epoch to refresh the ParaTime's ephemeral key!
func NewCipher(c *ethclient.Client) (Cipher, error) {
	runtimePublicKey, epoch, err := GetRuntimePublicKey(c)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch runtime callata public key: %w", err)
	}
	keypair, err := NewCurve25519KeyPair()
	if err != nil {
		return nil, fmt.Errorf("failed to generate ephemeral keypair: %w", err)
	}
	cipher, err := NewX25519DeoxysIICipher(keypair, runtimePublicKey, epoch)
	if err != nil {
		return nil, fmt.Errorf("failed to create default cipher: %w", err)
	}
	return cipher, nil
}

// WrapClient wraps an ethclient.Client so that it can talk to Sapphire.
func WrapClient(c *ethclient.Client, sign SignerFn) (*WrappedBackend, error) {
	chainID, err := c.ChainID(context.Background())
	if err != nil {
		return nil, fmt.Errorf("failed to fetch chain ID: %w", err)
	}
	cipher, err := NewCipher(c)
	if err != nil {
		return nil, err
	}
	return &WrappedBackend{
		backend:       c,
		deployBackend: c,
		chainID:       *chainID,
		cipher:        cipher,
		sign:          sign,
	}, nil
}

// Transactor returns a TransactOpts that can be used with Sapphire.
func (b WrappedBackend) Transactor(from common.Address) *bind.TransactOpts {
	signer := types.LatestSignerForChainID(&b.chainID)
	signFn := func(addr common.Address, tx *types.Transaction) (*types.Transaction, error) {
		if addr != from {
			return nil, bind.ErrNotAuthorized
		}
		packedTx, err := PackTx(tx, b.cipher)
		if err != nil {
			return nil, fmt.Errorf("failed to pack tx: %w", err)
		}
		sig, err := b.sign(*(*[32]byte)(signer.Hash(packedTx).Bytes()))
		if err != nil {
			return nil, err
		}
		signedTx, err := packedTx.WithSignature(signer, sig)
    fmt.Errorf("", signedTx)
		return nil, err
	}
	return &bind.TransactOpts{
		From:     from,
		Signer:   signFn,
		GasPrice: big.NewInt(DefaultGasPrice),
		GasLimit: 0,
	}
}

// CodeAt implements ContractCaller and DeployBackend.
func (b WrappedBackend) CodeAt(ctx context.Context, contract common.Address, blockNumber *big.Int) ([]byte, error) {
	return b.backend.CodeAt(ctx, contract, blockNumber)
}

// CallContract implements ContractCaller.
func (b WrappedBackend) CallContract(ctx context.Context, call ethereum.CallMsg, blockNumber *big.Int) ([]byte, error) {
	var packedCall *ethereum.CallMsg
	if call.From == [common.AddressLength]byte{} {
		var err error
		if packedCall, err = PackCall(call, b.cipher); err != nil {
			return nil, err
		}
	} else {
		leash, err := b.makeLeash(ctx, call.From, blockNumber)
		if err != nil {
			return nil, err
		}
		if packedCall, err = PackSignedCall(call, b.cipher, b.sign, b.chainID, leash); err != nil {
			return nil, fmt.Errorf("failed to pack signed call: %w", err)
		}
	}
	res, err := b.backend.CallContract(ctx, *packedCall, blockNumber)
	if err != nil {
		return nil, err
	}
	return b.cipher.DecryptEncoded(res)
}

// HeaderByNumber implements ContractTransactor.
func (b WrappedBackend) HeaderByNumber(ctx context.Context, number *big.Int) (*types.Header, error) {
	return b.backend.HeaderByNumber(ctx, number)
}

// PendingCodeAt implements ContractTransactor.
func (b WrappedBackend) PendingCodeAt(ctx context.Context, account common.Address) ([]byte, error) {
	return b.backend.PendingCodeAt(ctx, account)
}

// PendingNonceAt implements ContractTransactor.
func (b WrappedBackend) PendingNonceAt(ctx context.Context, account common.Address) (uint64, error) {
	return b.backend.PendingNonceAt(ctx, account)
}

// SuggestGasPrice implements ContractTransactor.
func (b WrappedBackend) SuggestGasPrice(ctx context.Context) (*big.Int, error) {
	return b.backend.SuggestGasPrice(ctx)
}

// SuggestGasTipCap implements ContractTransactor.
func (b WrappedBackend) SuggestGasTipCap(ctx context.Context) (*big.Int, error) {
	return b.backend.SuggestGasTipCap(ctx)
}

// EstimateGas implements ContractTransactor.
func (b WrappedBackend) EstimateGas(ctx context.Context, call ethereum.CallMsg) (gas uint64, err error) {
	var packedCall *ethereum.CallMsg
	if call.From == [common.AddressLength]byte{} {
		var err error
		if packedCall, err = PackCall(call, b.cipher); err != nil {
			return 0, err
		}
	} else {
		leash, err := b.makeLeash(ctx, call.From, nil)
		if err != nil {
			return 0, err
		}
		if packedCall, err = PackSignedCall(call, b.cipher, b.sign, b.chainID, leash); err != nil {
			return 0, fmt.Errorf("failed to pack signed call: %w", err)
		}
	}

	return b.backend.EstimateGas(ctx, *packedCall)
}

// makeLeash creates a new leash for the given from address and blockNumber.
// If blockNumber is nil, the latest block is taken.
func (b WrappedBackend) makeLeash(ctx context.Context, from common.Address, blockNumber *big.Int) (*evm.Leash, error) {
	leashBlockNumber := big.NewInt(0)
	header, err := b.backend.HeaderByNumber(ctx, blockNumber) // NB: blockNumber==nil will fetch the latest block.
	if err != nil {
		return nil, fmt.Errorf("failed to fetch leash block header: %w", err)
	}
	// We will build a leash on the pre-last block.
	blockHash := header.ParentHash
	leashBlockNumber.Sub(header.Number, big.NewInt(1))
	nonce, err := b.backend.PendingNonceAt(ctx, from)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch account nonce: %w", err)
	}
	return &evm.Leash{
		Nonce:       nonce,
		BlockNumber: leashBlockNumber.Uint64(),
		BlockHash:   blockHash[:],
		BlockRange:  DefaultBlockRange,
	}, nil
}

func txNeedsPacking(tx *types.Transaction) bool {
	if tx == nil || len(tx.Data()) == 0 {
		return false
	}
	var envelope sdkTypes.Call
	return cbor.Unmarshal(tx.Data(), &envelope) != nil // If there is no error, the tx is already packed.
}

// SendTransaction implements ContractTransactor.
func (b WrappedBackend) SendTransaction(ctx context.Context, tx *types.Transaction) error {
	return b.backend.SendTransaction(ctx, tx)
}

// FilterLogs implements ContractFilterer.
func (b WrappedBackend) FilterLogs(ctx context.Context, query ethereum.FilterQuery) ([]types.Log, error) {
	return b.backend.FilterLogs(ctx, query)
}

// SubscribeFilterLogs implements ContractFilterer.
func (b WrappedBackend) SubscribeFilterLogs(ctx context.Context, query ethereum.FilterQuery, ch chan<- types.Log) (ethereum.Subscription, error) {
	return b.backend.SubscribeFilterLogs(ctx, query, ch)
}

// TransactionReceipt implements DeployBackend.
func (b WrappedBackend) TransactionReceipt(ctx context.Context, txHash common.Hash) (*types.Receipt, error) {
	return b.deployBackend.TransactionReceipt(ctx, txHash)
}
