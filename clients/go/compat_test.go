package sapphire

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"log"
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"

	"github.com/oasisprotocol/oasis-core/go/common/cbor"
	"github.com/oasisprotocol/oasis-sdk/client-sdk/go/modules/evm"

	"github.com/ethereum/go-ethereum/ethclient"
)

func TestPackSignedCall(t *testing.T) {
	privateKey, _ := crypto.HexToECDSA("c07b151fbc1e7a11dff926111188f8d872f62eba0396da97c0a24adb75161750")
	signFn := func(digest [32]byte) ([]byte, error) {
		// Pass in a custom signing function to interact with the signer
		return crypto.Sign(digest[:], privateKey)
	}

	messageFunction, _ := hexutil.Decode("0xe21f37ce")
	to := common.HexToAddress("0x595cce2312b7dfb068eb7dbb8c2b0b593b5c8883")
	from := common.HexToAddress("0xDce075E1C39b1ae0b75D554558b6451A226ffe00")
	signature := "xM1D1tqLQM+lEZ8cNLgQq/KbCTB7Y3G2PVJ/yaR0ViAbH3eorfUZ6KRtRK65wNctZtRSWtCZ931uXkIbbH+Lnhw="
	msg := ethereum.CallMsg{
		From:       from,
		To:         &to,
		Gas:        0,
		GasPrice:   nil,
		GasFeeCap:  nil,
		GasTipCap:  nil,
		Value:      nil,
		Data:       messageFunction,
		AccessList: nil,
	}

	leash := evm.Leash{
		Nonce:       0x12,
		BlockNumber: 0x1234,
		BlockHash:   common.HexToHash("2ec361fee28d09a3ad2c4d5f7f95d409ce2b68c39b5d647edf0ea651e069e4a8").Bytes(),
		BlockRange:  15,
	}

	cipher := NewPlainCipher()
	packedCall, err := PackSignedCall(msg, cipher, signFn, *big.NewInt(0x5aff), &leash)
	if err != nil {
		t.Fatalf("err while packing signed call %v", err)
	}
	if packedCall.From != from {
		t.Fatalf("err from mismatch: expected %s got %s", from, packedCall.From)
	}
	if packedCall.To.String() != to.String() {
		t.Fatalf("err to mismatch: expected %s got %s", to, packedCall.To)
	}
	if packedCall.Gas == 0 {
		t.Fatalf("err gas should not be zero")
	}
	if packedCall.GasPrice == nil || packedCall.GasPrice.Uint64() == 0 {
		t.Fatalf("err gas price should not be zero")
	}

	var dataDecoded evm.SignedCallDataPack
	if err = cbor.Unmarshal(packedCall.Data, &dataDecoded); err != nil {
		t.Fatalf("err while decoding signed call %v", err)
	}
	var messageFunctionDecoded []byte
	if err = cbor.Unmarshal(dataDecoded.Data.Body, &messageFunctionDecoded); err != nil {
		t.Fatalf("err while decoding inner data body %v", err)
	}
	if string(messageFunctionDecoded) != string(messageFunction) {
		t.Fatalf("err innerdata mismatch: expected %s got %s", messageFunction, messageFunctionDecoded)
	}

	signatureDecoded := base64.StdEncoding.EncodeToString(dataDecoded.Signature)
	if signatureDecoded != signature {
		t.Fatalf("err innerdata signature mismatch: expected %s got %s", signature, signatureDecoded)
	}

	leashOrig, _ := json.Marshal(leash)
	leashDecoded, _ := json.Marshal(dataDecoded.Leash)
	if err != nil {
		t.Fatalf("err while encoding innerdata leash %v", err)
	}
	if string(leashOrig) != string(leashDecoded) {
		t.Fatalf("err innerdata leash mismatch: expected %s got %s", leashOrig, leashDecoded)
	}
}

func TestDial(t *testing.T) {
	key, err := crypto.HexToECDSA("ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80")
	if err != nil {
		log.Fatal(err)
	}
	addr1 := crypto.PubkeyToAddress(key.PublicKey)

	key2, err := crypto.GenerateKey()
	if err != nil {
		log.Fatal(err)
	}
	addr2 := crypto.PubkeyToAddress(key2.PublicKey)

	SapphireChainID := uint64(0x5afd)
	client, _ := ethclient.Dial(Networks[SapphireChainID].DefaultGateway)
	backend, err := WrapClient(client, func(digest [32]byte) ([]byte, error) {
		// Pass in a custom signing function to interact with the signer
		return crypto.Sign(digest[:], key)
	})
	if err != nil {
		t.Fatalf("failed to wrap client %v", err)
	}

	nonce, err := client.PendingNonceAt(context.Background(), addr1)
	if err != nil {
		t.Fatalf("failed to get pending nonce %v", err)
	}

	gasPrice, err := client.SuggestGasPrice(context.Background())
	if err != nil {
		t.Fatalf("failed to get gas price %v", err)
	}

	txOpts := backend.Transactor(addr1)

	tx := types.NewTransaction(nonce, addr2, big.NewInt(1), uint64(100000), gasPrice, nil)
	signedTx, err := txOpts.Signer(addr1, tx)
	if err != nil {
		t.Fatalf("failed to sign transaction %v", err)
	}

	err = client.SendTransaction(context.Background(), signedTx)
	if err != nil {
		t.Fatalf("failed to send transaction %v", err)
	}

	receipt, err := bind.WaitMined(context.Background(), client, signedTx)
	if err != nil {
		t.Fatalf("transaction failed! %v", err)
	}

	if receipt.Status != uint64(1) {
		t.Fatalf("transaction failed! (status=%v)", receipt.Status)
	}
}
