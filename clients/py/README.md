# sapphire.py

```python
from web3 import Web3
from sapphirepy import sapphire

# Setup your Web3 provider with a signing account
w3 = Web3(Web3.HTTPProvider('http://localhost:8545'))
w3.middleware_onion.add(construct_sign_and_send_raw_middleware(account))

# Finally, wrap the provider to add Sapphire end-to-end encryption
w3 = sapphire.wrap(w3)
```

The Sapphire middleware for Web3.py ensures all transactions, gas estimates and view calls are end-to-end encrypted between your application and the smart contract.

