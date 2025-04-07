# sapphire.py

## Installation

```shell
pip3 install --user -r requirements.txt
pip3 install --user -r requirements.dev.txt
make
```

## Changelog

https://github.com/oasisprotocol/sapphire-paratime/tree/main/clients/py/CHANGELOG.md

## Usage

```python
from web3 import Web3, AsyncWeb3
from web3.middleware import SignAndSendRawMiddlewareBuilder
from eth_account import Account
from eth_account.signers.local import LocalAccount

from sapphirepy import sapphire

w3 = Web3(Web3.HTTPProvider(sapphire.NETWORKS['sapphire-localnet']))
async_w3 = AsyncWeb3(
    AsyncWeb3.AsyncHTTPProvider(
        sapphire.NETWORKS['sapphire-localnet']
    )
)

# Optional: Setup your Web3 provider with a signing account.
# This account is used for signing transactions.
account: LocalAccount = (
    Account.from_key(  # pylint: disable=no-value-for-parameter
        private_key="<your_private_key_here>"
    )
)
w3.middleware_onion.add(SignAndSendRawMiddlewareBuilder.build(account))

# Finally, wrap the provider to add Sapphire end-to-end encryption.
# Note: Account parameter in the wrap() function is used for signing view
# calls and can be different from the account used for singing transactions.
w3 = sapphire.wrap(w3, account) # Can provide custom "account" parameter
# Wrapper middleware also works with AsyncWeb3
async_w3 = sapphire.wrap(async_w3, account)

# Optionally, query Oasis Web3 Gateway for the gas price.
# from web3.gas_strategies.rpc import rpc_gas_price_strategy
# w3.eth.set_gas_price_strategy(rpc_gas_price_strategy)
```

The Sapphire middleware for Web3.py ensures all transactions, gas estimates and
view calls are end-to-end encrypted between your application and the smart
contract.


## License

The [Deoxys-ii library](sapphirepy/deoxysii.py) and its
[test vectors](tests/testdata/Deoxys-II-256-128.json) are derived directly
from the [original go library](https://github.com/oasisprotocol/deoxysii).

The remainder of the Oasis Sapphire python bindings is licensed under Apache 2.0
license.
