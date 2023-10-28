import os
import json
import unittest
from typing import Type

from web3 import Web3
from web3.exceptions import ContractLogicError, ContractCustomError
from web3.contract.contract import Contract
from web3.middleware import construct_sign_and_send_raw_middleware
from eth_account import Account
from eth_account.signers.local import LocalAccount

from sapphirepy import sapphire

TESTDATA = os.path.join(os.path.dirname(__file__), 'testdata')
GREETER_ABI = os.path.join(TESTDATA, 'Greeter.abi')
GREETER_BIN = os.path.join(TESTDATA, 'Greeter.bin')
GREETER_SOL = os.path.join(TESTDATA, 'Greeter.sol')

def compiled_test_contract():
    if not os.path.exists(GREETER_ABI):
        # pylint: disable=import-outside-toplevel
        from solcx import compile_source    # type: ignore
        with open(GREETER_SOL, 'r', encoding='utf-8') as handle:
            compiled_sol = compile_source(
                handle.read(),
                output_values=['abi', 'bin']
            )
            _, contract_interface = compiled_sol.popitem()
        with open(GREETER_ABI, 'w', encoding='utf-8') as handle:
            json.dump(contract_interface['abi'], handle)
        with open(GREETER_BIN, 'w', encoding='utf-8') as handle:
            json.dump(contract_interface['bin'], handle)
        return {
            'abi': contract_interface['abi'],
            'bin': contract_interface['bin'],
        }
    with open(GREETER_ABI, 'rb') as abi_handle:
        with open(GREETER_BIN, 'rb') as bin_handle:
            return {
                'abi': json.load(abi_handle),
                'bin': json.load(bin_handle)
            }

class TestEndToEnd(unittest.TestCase):
    greeter:Contract|Type[Contract]
    w3: Web3

    def setUp(self):
        account: LocalAccount = Account.from_key("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80")  # pylint: disable=no-value-for-parameter

        w3 = Web3(Web3.HTTPProvider('http://localhost:8545'))
        w3.middleware_onion.add(construct_sign_and_send_raw_middleware(account))
        self.w3 = w3 = sapphire.wrap(w3)

        w3.eth.default_account = account.address

        iface = compiled_test_contract()

        contract = w3.eth.contract(abi=iface['abi'], bytecode=iface['bin'])
        tx_hash = contract.constructor().transact({'gasPrice': w3.eth.gas_price})
        tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

        self.greeter = w3.eth.contract(address=tx_receipt['contractAddress'], abi=iface['abi'])

    def test_viewcall_revert_custom(self):
        with self.assertRaises(ContractCustomError) as cm:
            self.greeter.functions.revertWithCustomError().call()
        data = self.greeter.encodeABI(
            fn_name="MyCustomError", args=["thisIsCustom"]
        )
        self.assertEqual(cm.exception.args[0], data)

    def test_viewcall_revert_reason(self):
        with self.assertRaises(ContractLogicError) as cm:
            self.greeter.functions.revertWithReason().call()
        self.assertEqual(cm.exception.message, 'execution reverted: reasonGoesHere')

    def test_viewcall(self):
        self.assertEqual(self.greeter.functions.greet().call(), 'Hello')

    def test_transaction(self):
        w3 = self.w3
        greeter = self.greeter

        x = self.greeter.functions.blah().transact({'gasPrice': w3.eth.gas_price})
        y = w3.eth.wait_for_transaction_receipt(x)
        z = greeter.events.Greeting().process_receipt(y)
        self.assertEqual(z[0].args['g'], 'Hello')

if __name__ == '__main__':
    unittest.main()
