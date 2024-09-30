package sapphire

import (
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/ethclient"

	"github.com/oasisprotocol/curve25519-voi/primitives/x25519"
	"github.com/oasisprotocol/deoxysii"
	"github.com/oasisprotocol/oasis-core/go/common/cbor"
	mraeApi "github.com/oasisprotocol/oasis-core/go/common/crypto/mrae/api"
	mrae "github.com/oasisprotocol/oasis-core/go/common/crypto/mrae/deoxysii"
	"github.com/oasisprotocol/oasis-sdk/client-sdk/go/types"
)

type Kind uint64

var (
	ErrCallFailed       = errors.New("call failed in module")
	ErrCallResultDecode = errors.New("could not decode call result")
)

type Cipher interface {
	CallFormat() types.CallFormat
	Encrypt(plaintext []byte) (ciphertext []byte, nonce []byte)
	Decrypt(nonce []byte, ciphertext []byte) (plaintext []byte, err error)
	EncryptEncode(plaintext []byte) []byte
	EncryptEnvelope(plaintext []byte) *types.Call
	DecryptEncoded(result []byte) ([]byte, error)
	DecryptCallResult(result []byte) ([]byte, error)
}

type PlainCipher struct{}

// NewPlainCipher creates a cipher instance without encryption support.
func NewPlainCipher() PlainCipher {
	return PlainCipher{}
}

func (c PlainCipher) CallFormat() types.CallFormat {
	return types.CallFormatPlain
}

func (c PlainCipher) Encrypt(plaintext []byte) (ciphertext []byte, nonce []byte) {
	nonce = make([]byte, 0)
	return plaintext, nonce
}

func (c PlainCipher) Decrypt(_ []byte, ciphertext []byte) (plaintext []byte, err error) {
	return ciphertext, nil
}

func (c PlainCipher) DecryptCallResult(response []byte) ([]byte, error) {
	var callResult types.CallResult
	if err := cbor.Unmarshal(response, &callResult); err != nil {
		return nil, err
	}

	// TODO: actually decode and return failure
	if callResult.Failed != nil {
		return nil, ErrCallFailed
	}

	if callResult.Unknown != nil {
		var unknown []byte
		if err := cbor.Unmarshal(callResult.Unknown, &unknown); err != nil {
			return nil, fmt.Errorf("failed decoding callResult.Unknown: %w", err)
		}
		return unknown, nil
	}

	if callResult.Ok != nil {
		var ok []byte
		if err := cbor.Unmarshal(callResult.Ok, &ok); err != nil {
			return nil, fmt.Errorf("failed decoding callResult.Ok: %w", err)
		}
		return ok, nil
	}

	return nil, ErrCallResultDecode
}

func (c PlainCipher) DecryptEncoded(response []byte) ([]byte, error) {
	return c.DecryptCallResult(response)
}

func (c PlainCipher) EncryptEnvelope(plaintext []byte) *types.Call {
	// Txs without data are just balance transfers, and all data in those is public.
	if len(plaintext) == 0 {
		return nil
	}
	return &types.Call{
		Body:   cbor.Marshal(plaintext),
		Format: c.CallFormat(),
	}
}

func (c PlainCipher) EncryptEncode(plaintext []byte) []byte {
	envelope := c.EncryptEnvelope(plaintext)
	return cbor.Marshal(envelope)
}

// X25519DeoxysIICipher is the default cipher that does what it says on the tin.
type X25519DeoxysIICipher struct {
	cipher  cipher.AEAD
	keypair *Curve25519KeyPair
	epoch   uint64
}

type Curve25519KeyPair struct {
	PublicKey x25519.PublicKey
	SecretKey x25519.PrivateKey
}

// NewCurve25519KeyPair generates a random keypair suitable for use with the X25519DeoxysII cipher.
func NewCurve25519KeyPair() (*Curve25519KeyPair, error) {
	public, private, err := x25519.GenerateKey(nil)
	if err != nil {
		return nil, err
	}
	return &Curve25519KeyPair{
		PublicKey: *public,
		SecretKey: *private,
	}, nil
}

// NewX25519DeoxysIICipher creates a new cipher instance with encryption support.
func NewX25519DeoxysIICipher(keypair *Curve25519KeyPair, peerPublicKey *x25519.PublicKey, epoch uint64) (*X25519DeoxysIICipher, error) {
	var sharedKey [deoxysii.KeySize]byte
	mrae.Box.DeriveSymmetricKey(sharedKey[:], peerPublicKey, &keypair.SecretKey)
	cipher, err := deoxysii.New(sharedKey[:])
	mraeApi.Bzero(sharedKey[:])
	if err != nil {
		return nil, err
	}
	return &X25519DeoxysIICipher{
		cipher:  cipher,
		keypair: keypair,
		epoch:   epoch,
	}, nil
}

func (c X25519DeoxysIICipher) CallFormat() types.CallFormat {
	return types.CallFormatEncryptedX25519DeoxysII
}

func (c X25519DeoxysIICipher) Encrypt(plaintext []byte) (ciphertext []byte, nonce []byte) {
	nonce = make([]byte, deoxysii.NonceSize)
	if _, err := rand.Reader.Read(nonce); err != nil {
		panic(fmt.Sprintf("crypto/rand is unavailable: %v", err))
	}
	res := c.cipher.Seal(ciphertext, nonce, plaintext, []byte{})
	return res, nonce
}

func (c X25519DeoxysIICipher) Decrypt(nonce []byte, ciphertext []byte) ([]byte, error) {
	meta := make([]byte, 0)
	return c.cipher.Open(ciphertext[:0], nonce, ciphertext, meta)
}

func (c X25519DeoxysIICipher) encryptCallData(plaintext []byte) (ciphertext []byte, nonce []byte) {
	return c.Encrypt(cbor.Marshal(types.Call{
		Body: cbor.Marshal(plaintext),
	}))
}

func (c X25519DeoxysIICipher) EncryptEnvelope(plaintext []byte) *types.Call {
	// Txs without data are just balance transfers, and all data in those is public.
	if len(plaintext) == 0 {
		return nil
	}
	data, nonce := c.encryptCallData(plaintext)

	return &types.Call{
		Body: cbor.Marshal(types.CallEnvelopeX25519DeoxysII{
			Nonce: [deoxysii.NonceSize]byte(nonce),
			Data:  data,
			Epoch: c.epoch,
			Pk:    c.keypair.PublicKey,
		}),
		Format: c.CallFormat(),
	}
}

func (c X25519DeoxysIICipher) EncryptEncode(plaintext []byte) []byte {
	envelope := c.EncryptEnvelope(plaintext)
	return cbor.Marshal(envelope)
}

func (c X25519DeoxysIICipher) DecryptCallResult(response []byte) ([]byte, error) {
	var callResult types.CallResult
	if err := cbor.Unmarshal(response, &callResult); err != nil {
		return nil, err
	}

	// TODO: actually decode and return failure
	if callResult.Failed != nil {
		return nil, ErrCallFailed
	}

	var aeadEnvelope types.ResultEnvelopeX25519DeoxysII
	if callResult.Ok != nil {
		if err := cbor.Unmarshal(callResult.Ok, &aeadEnvelope); err != nil {
			// If Ok is not CBOR, return raw value.
			return callResult.Ok, nil
		}
	} else if callResult.Unknown != nil {
		if err := cbor.Unmarshal(callResult.Unknown, &aeadEnvelope); err != nil {
			// If Unknown is not CBOR, return raw value.
			return callResult.Unknown, nil
		}
	} else {
		return nil, ErrCallResultDecode
	}

	decrypted, err := c.Decrypt(aeadEnvelope.Nonce[:], aeadEnvelope.Data)
	if err != nil {
		return nil, err
	}

	var innerResult types.CallResult
	if err = cbor.Unmarshal(decrypted, &innerResult); err != nil {
		return nil, err
	}

	if innerResult.Unknown != nil {
		var unknown []byte
		if err = cbor.Unmarshal(innerResult.Unknown, &unknown); err != nil {
			return nil, fmt.Errorf("failed decoding innerResult.Unknown: %w", err)
		}
		return unknown, nil
	}

	if innerResult.Ok != nil {
		var ok []byte
		if err = cbor.Unmarshal(innerResult.Ok, &ok); err != nil {
			return nil, fmt.Errorf("failed decoding innerResult.Ok: %w", err)
		}
		return ok, nil
	}

	if innerResult.Failed != nil {
		msg := innerResult.Failed.Message
		if len(msg) == 0 {
			msg = fmt.Sprintf("call failed in module %s with code %d", innerResult.Failed.Module, innerResult.Failed.Code)
		}
		return nil, errors.New(msg)
	}

	return nil, fmt.Errorf("unexpected inner call result: %x", callResult.Unknown)
}

func (c X25519DeoxysIICipher) DecryptEncoded(response []byte) ([]byte, error) {
	return c.DecryptCallResult(response)
}

// GetRuntimePublicKey fetches the runtime calldata public key from the default Sapphire gateway.
func GetRuntimePublicKey(c *ethclient.Client) (*x25519.PublicKey, uint64, error) {
	var pubKey CallDataPublicKey

	if err := c.Client().Call(&pubKey, "oasis_callDataPublicKey"); err != nil {
		return nil, 0, fmt.Errorf("invalid response when fetching runtime calldata public key: %w", err)
	}

	if len(pubKey.PublicKey) != x25519.PublicKeySize {
		return nil, 0, fmt.Errorf("invalid public key length")
	}

	return (*x25519.PublicKey)(pubKey.PublicKey), pubKey.Epoch, nil
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

// CallDataPublicKey is the public key alongside the key manager's signature.
// See Web3 gateway repository for more information
// https://github.com/oasisprotocol/oasis-web3-gateway/blob/d29efdafe4e07a9f0f9a0fd13379c58eb5b89723/rpc/oasis/api.go#L21-L33
// This is a flattened `core.CallDataPublicKeyResponse` with hex-encoded bytes for easy consumption by Web3 clients.
type CallDataPublicKey struct {
	// PublicKey is the requested public key.
	PublicKey hexutil.Bytes `json:"key"`
	// Checksum is the checksum of the key manager state.
	Checksum hexutil.Bytes `json:"checksum"`
	// Signature is the Sign(sk, (key || checksum)) from the key manager.
	Signature hexutil.Bytes `json:"signature"`
	// Epoch is the epoch of the ephemeral runtime key.
	Epoch uint64 `json:"epoch,omitempty"`
}
