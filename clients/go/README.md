# Sapphire ParaTime Compat Lib

[@oasisprotocol/sapphire-paratime] makes it easy to port your dapp to the [Sapphire ParaTime].
You can port over a Go Ethereum application by using a `sapphire.WrappedBackend`
or by packing native Ethereum transactions Sapphire style.

[@oasisprotocol/sapphire-paratime]: https://pkg.go.dev/github.com/oasisprotocol/sapphire-paratime/go/
[sapphire paratime]: https://docs.oasis.dev/general/developer-resources/sapphire-paratime/

_If your dapp doesn't port in under 10 minutes, it's a bug!_  

If you have more than a little trouble, please file an issue. There should be
_no_ reason _not_ to use the Sapphire ParaTime!

## Building

Sapphire Paratime compatibility library works with `Go` version 1.17 or later and the latest comparable `go-ethereum` version.

To build and test locally, import the `Go` package.

## Usage

### Go-Ethereum ABI

After [generating](https://geth.ethereum.org/docs/dapp/abigen) the Go bindings
for a particular Solidity contract, you can use dial an Ethereum client with the
Sapphire Paratime gateway URL and instantiate a `sapphire.WrappedBackend` as a drop in
replacement.

```Go
// key := private key
c, _ := ethclient.Dial(sapphire.Networks[SapphireChainID.Uint64()].DefaultGateway)
backend := sapphire.WrapClient(*c, func(digest [32]byte)([]byte, error) {
  // Pass in a custom signing function to interact with the signer
  return crypto.Sign(digest[:], key)
})
```

Contracts using `go-ethereum`'s `abigen` can be used by passing in `backend` instead of the usual `ethclient`. For example,

```Go
txOpts := backend.Transactor(senderAddr)
nft, _ := NewNft(addr, backend)
tx, _ := nft.Transfer(txOpts, tokenId, recipient)
```

### Bring Your Own Signer

You can also package an Ethereum transaction for Sapphire by:

```Go
sapphireTestnetChainId := 0x5aff // Sapphire testnet
packedTx := sapphire.PackTx(tx, sapphire.NewCipher(sapphireTestnetChainId))
signedTx := sign(packedTx) // using your usual signer
```

and sending it with an normal, not-wrapped `ethclient`:

```Go
ethclient.SendTransaction(ctx, signedTx)
```

## See Also

- [Oasis Testnet Faucet](https://faucet.testnet.oasis.dev/)
- [Creating dapps for Sapphire](https://docs.oasis.io/dapp/sapphire/quickstart)
- [How to Transfer ROSE into an EVM ParaTime](https://docs.oasis.io/general/manage-tokens/how-to-transfer-rose-into-paratime/)
