# Sapphire ParaTime Compat Lib

[@oasisprotocol/sapphire-paratime] makes it easy to port your dapp to the
[Sapphire ParaTime]. You can port over a Go Ethereum application by using a
`sapphire.WrappedBackend` or by packing native Ethereum transactions Sapphire
style.

[@oasisprotocol/sapphire-paratime]: https://pkg.go.dev/github.com/oasisprotocol/sapphire-paratime/go/
[Sapphire ParaTime]: https://docs.oasis.io/build/sapphire

## Building

Sapphire compatibility library works with Go version 1.22 or later and the
latest compatible `go-ethereum` version.

To build and test locally:

```shell
go test
```

## Usage

### Import

```go
import (
    "context"

    "github.com/ethereum/go-ethereum/accounts/abi/bind"
    "github.com/ethereum/go-ethereum/ethclient"

    sapphire "github.com/oasisprotocol/sapphire-paratime/clients/go"
)
```

### Go-Ethereum ABI

After [generating](https://geth.ethereum.org/docs/dapp/abigen) the Go bindings
for a particular Solidity contract, you can instantiate an Ethereum client with
the Sapphire gateway URL and instantiate a `sapphire.WrappedBackend` as a drop
in replacement:

```go
// key := private key
client, _ := ethclient.Dial(sapphire.Networks[SapphireChainID.Uint64()].DefaultGateway)
backend, _ := sapphire.WrapClient(client, func(digest [32]byte)([]byte, error) {
  // Pass in a custom signing function to interact with the signer
  return crypto.Sign(digest[:], key)
})
```

Contracts using `go-ethereum`'s `abigen` can now be used by passing in `backend`
instead of the usual `ethclient.Client` instance:

```go
nft, _ := NewNft(addr, backend)
```

Confidential transactions using Go-Ethereum ABI wrapper can be submitted by
passing the Sapphire-specific `bind.TransactOpts` as the first parameter:

```go
txOpts := backend.Transactor(senderAddr)
tx, _ := nft.Transfer(txOpts, tokenId, recipient)
receipt, _ := bind.WaitMined(context.Background(), client, tx)
```

**WARNING:** If you forget to pass `txOpts` as described above, your transaction
**will be sent in plain-text**!

Confidential queries signed with your account's key are also supported on the
Sapphire-wrapped contract above, if you pass the `bind.CallOpts` defining your
`From` address:

```go
balance := nft.BalanceOf(&bind.CallOpts{From: "0xYOUR_ADDRESS"}, common.HexToAddress("0xDce075E1C39b1ae0b75D554558b6451A226ffe00"))
```

### Bring Your Own Signer

You can also package an existing Ethereum transaction for Sapphire by:

```go
sapphireTestnetChainId := 0x5aff // Sapphire Testnet.
packedTx := sapphire.PackTx(tx, sapphire.NewCipher(sapphireTestnetChainId))
signedTx := sign(packedTx) // Using your usual signer.
```

and sending it with a normal, not-wrapped `ethclient.Client` instance:

```go
_ = c.SendTransaction(ctx, signedTx)
```

## See Also

- [Oasis Testnet Faucet](https://faucet.testnet.oasis.io/)
- [Creating dapps for Sapphire](https://docs.oasis.io/build/sapphire/quickstart)
- [How to Transfer ROSE into an EVM ParaTime](https://docs.oasis.io/general/manage-tokens/how-to-transfer-rose-into-paratime/)
