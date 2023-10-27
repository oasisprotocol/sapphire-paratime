from web3 import Web3
from eth_account import Account
from eth_account.signers.local import LocalAccount
from web3.middleware import construct_sign_and_send_raw_middleware
from solcx import compile_source

from sapphirepy import sapphire

compiled_sol = compile_source(
    '''
    pragma solidity ^0.8.0;

    contract Greeter {
        string public greeting;

        constructor() public {
            greeting = 'Hello';
        }

        function setGreeting(string memory _greeting) public {
            greeting = _greeting;
        }

        function greet() view public returns (string memory) {
            return greeting;
        }

        event Greeting(string g);

        function blah() external {
            emit Greeting(greeting);
        }
    }
    ''',
    output_values=['abi', 'bin']
)
contract_id, contract_interface = compiled_sol.popitem()
bytecode = contract_interface['bin']
abi = contract_interface['abi']

account: LocalAccount = Account.from_key("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80")

w3 = Web3(Web3.HTTPProvider('http://localhost:8545'))
w3.middleware_onion.add(construct_sign_and_send_raw_middleware(account))
w3 = sapphire.wrap(w3)

w3.eth.default_account = account.address

Greeter = w3.eth.contract(abi=abi, bytecode=bytecode)
tx_hash = Greeter.constructor().transact({'gasPrice': w3.eth.gas_price})
tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

greeter = w3.eth.contract(address=tx_receipt.contractAddress, abi=abi)

assert greeter.functions.greet().call() == 'Hello'

x = greeter.functions.blah().transact({'gasPrice': w3.eth.gas_price})
y = w3.eth.wait_for_transaction_receipt(x)
z = greeter.events.Greeting().process_receipt(y)
assert z[0].args['g'] == 'Hello'
