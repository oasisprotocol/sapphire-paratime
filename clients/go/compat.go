package sapphire

import (
	"context"
	"fmt"
	"math/big"
	"sync"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/fxamacker/cbor/v2"
	"github.com/twystd/tweetnacl-go/tweetnacl"
)

const (
	DefaultGasPrice   = 100_000_000_000
	DefaultGasLimit   = 30_000_000 // Default gas params are assigned in the web3 gateway.
	DefaultBlockRange = 15
)

// packedTxs stores the txs that have been packed in the signer and therefore do not need to be packed in `backend.SendTransaction`.
var packedTxs sync.Map

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
		DefaultGateway: "https://testnet.sapphire.oasis.dev",
		RuntimeID:      "0x000000000000000000000000000000000000000000000000a6d1e3ebf60dff6c",
	},
	0x5afe: {
		Name:           "mainnet",
		ChainID:        *big.NewInt(0x5afe),
		DefaultGateway: "https://sapphire.oasis.dev",
		RuntimeID:      "0x0000000000000000000000000000000000000000000000000000000000000000",
	},
}

// PackTx prepares a regular Eth transaction for Sapphire. The transaction returned this function is what must be signed.
func PackTx(tx types.Transaction, cipher Cipher) (*types.Transaction, error) {
	if !txNeedsPacking(&tx) {
		return &tx, nil
	}
	return packTx(tx, cipher)
}

func packTx(tx types.Transaction, cipher Cipher) (*types.Transaction, error) {
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

// PackSignedCall prepares `msg` in-place for being sent to Sapphire. The call will be end-to-end encrypted and a signature will be used to authenticate the `from` address.
func PackSignedCall(msg ethereum.CallMsg, cipher Cipher, sign SignerFn, chainID big.Int, leash Leash) (*ethereum.CallMsg, error) {
	dataPack, err := NewDataPack(sign, chainID.Uint64(), msg.From[:], msg.To[:], DefaultGasLimit, msg.GasPrice, msg.Value, msg.Data, leash)
	if err != nil {
		return nil, fmt.Errorf("failed to create signed call data back: %w", err)
	}
	msg.Data = dataPack.EncryptEncode(cipher)
	return &msg, nil
}

type WrappedBackend struct {
	backend bind.ContractBackend
	chainID big.Int
	cipher  Cipher
	sign    SignerFn
}

func NewWrappedBackend(backend bind.ContractBackend, chainID big.Int, cipher Cipher, sign SignerFn) WrappedBackend {
	return WrappedBackend{
		backend: backend,
		chainID: chainID,
		cipher:  cipher,
		sign:    sign,
	}
}

// NewCipher creates a default cipher.
func NewCipher(chainID uint64) (Cipher, error) {
	runtimePublicKey, err := GetRuntimePublicKey(chainID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch runtime callata public key: %w", err)
	}
	keypair, err := tweetnacl.CryptoBoxKeyPair()
	if err != nil {
		return nil, fmt.Errorf("failed to generate ephemeral keypair: %w", err)
	}
	cipher, err := NewX25519DeoxysIICipher(*keypair, *runtimePublicKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create default cipher: %w", err)
	}
	return cipher, nil
}

// Wrap wraps an ethclient.Client so that it can talk to Sapphire.
func WrapClient(c ethclient.Client, sign SignerFn) (*WrappedBackend, error) {
	chainID, err := c.ChainID(context.Background())
	if err != nil {
		return nil, fmt.Errorf("failed to fetch chain ID: %w", err)
	}
	cipher, err := NewCipher(chainID.Uint64())
	if err != nil {
		return nil, err
	}
	return &WrappedBackend{
		backend: &c,
		chainID: *chainID,
		cipher:  cipher,
		sign:    sign,
	}, nil
}

// Transactor returns a TransactOpts that can be used with Sapphire.
func (b WrappedBackend) Transactor(from common.Address) *bind.TransactOpts {
	signer := types.LatestSignerForChainID(&b.chainID)
	signFn := func(addr common.Address, tx *types.Transaction) (*types.Transaction, error) {
		if addr != from {
			return nil, bind.ErrNotAuthorized
		}
		packedTx, err := PackTx(*tx, b.cipher)
		if err != nil {
			return nil, fmt.Errorf("failed to pack tx: %w", err)
		}
		sig, err := b.sign(*(*[32]byte)(signer.Hash(packedTx).Bytes()))
		if err != nil {
			return nil, err
		}
		signedTx, err := packedTx.WithSignature(signer, sig)
		packedTxs.Store(signedTx.Hash(), struct{}{})
		return signedTx, err
	}
	return &bind.TransactOpts{
		From:     from,
		Signer:   signFn,
		GasPrice: big.NewInt(DefaultGasPrice),
		GasLimit: DefaultGasLimit,
	}
}

// CodeAt implements ContractCaller.
func (b WrappedBackend) CodeAt(ctx context.Context, contract common.Address, blockNumber *big.Int) ([]byte, error) {
	return b.backend.CodeAt(ctx, contract, blockNumber)
}

// CallContract implements ContractCaller.
func (b WrappedBackend) CallContract(ctx context.Context, call ethereum.CallMsg, blockNumber *big.Int) ([]byte, error) {
	var packedCall *ethereum.CallMsg
	var err error
	if call.From == [common.AddressLength]byte{} {
		if packedCall, err = PackCall(call, b.cipher); err != nil {
			return nil, err
		}
	} else {
		leashBlockNumber := big.NewInt(0)
		if blockNumber != nil {
			leashBlockNumber.Sub(blockNumber, big.NewInt(1))
		} else {
			latestHeader, err := b.backend.HeaderByNumber(ctx, nil)
			if err != nil {
				return nil, fmt.Errorf("failed to fetch latest block number: %w", err)
			}
			leashBlockNumber.Sub(latestHeader.Number, big.NewInt(1))
		}
		header, err := b.backend.HeaderByNumber(ctx, leashBlockNumber)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch leash block header: %w", err)
		}
		blockHash := header.Hash()
		leash := NewLeash(header.Nonce.Uint64(), header.Number.Uint64(), blockHash[:], DefaultBlockRange)
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

// SuggestGasPrice implemennts ContractTransactor.
func (b WrappedBackend) SuggestGasPrice(ctx context.Context) (*big.Int, error) {
	return b.backend.SuggestGasPrice(ctx)
}

// SuggestGasTipCap implemennts ContractTransactor.
func (b WrappedBackend) SuggestGasTipCap(ctx context.Context) (*big.Int, error) {
	return b.backend.SuggestGasTipCap(ctx)
}

// EstimateGas implements ContractTransactor.
func (b WrappedBackend) EstimateGas(ctx context.Context, call ethereum.CallMsg) (gas uint64, err error) {
	return DefaultGasLimit, nil
	// TODO(#39)
	// header, err := b.backend.HeaderByNumber(ctx, blockNumber)
	// if err != nil {
	// 	return nil, err
	// }
	// if err = packContractCall(header, &call, b.ChainID.Uint64(), b.Signer, b.Cipher); err != nil {
	// 	return nil, err
	// }
	// return b.backend.EstimateGas(ctx, call)
}

func txNeedsPacking(tx *types.Transaction) bool {
	_, isPacked := packedTxs.Load(tx.Hash())
	if tx == nil || len(tx.Data()) == 0 || isPacked {
		return false
	}
	var envelope Data
	return cbor.Unmarshal(tx.Data(), &envelope) != nil // If there is no error, the tx is already packed.
}

// SendTransaction implements ContractTransactor.
func (b WrappedBackend) SendTransaction(ctx context.Context, tx *types.Transaction) error {
	if !txNeedsPacking(tx) {
		return b.backend.SendTransaction(ctx, tx)
	}
	packedTx, err := packTx(*tx, b.cipher)
	if err != nil {
		return fmt.Errorf("failed to pack tx: %w", err)
	}
	signer := types.LatestSignerForChainID(&b.chainID)
	txHash := signer.Hash(packedTx).Bytes()
	signature, err := b.sign(*(*[32]byte)(txHash))
	if err != nil {
		return fmt.Errorf("failed to sign wrapped tx: %w", err)
	}
	signedTx, err := packedTx.WithSignature(signer, signature)
	if err != nil {
		return fmt.Errorf("failed to attach signature to wrapped tx: %w", err)
	}
	packedTxs.Delete(signedTx.Hash())
	return b.backend.SendTransaction(ctx, signedTx)
}

// FilterLogs implements ContractFilterer.
func (b WrappedBackend) FilterLogs(ctx context.Context, query ethereum.FilterQuery) ([]types.Log, error) {
	return b.backend.FilterLogs(ctx, query)
}

// SubscribeFilterLogs implements ContractFilterer.
func (b WrappedBackend) SubscribeFilterLogs(ctx context.Context, query ethereum.FilterQuery, ch chan<- types.Log) (ethereum.Subscription, error) {
	return b.backend.SubscribeFilterLogs(ctx, query, ch)
}
