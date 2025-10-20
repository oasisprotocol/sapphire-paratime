import os
import json
import unittest
from typing import Type, Union

from web3 import Web3
from web3.exceptions import ContractLogicError, ContractCustomError
from web3.contract.contract import Contract
from web3.middleware import SignAndSendRawMiddlewareBuilder
from eth_account import Account
from eth_account.signers.local import LocalAccount
from eth_utils import function_signature_to_4byte_selector

from sapphirepy import sapphire

TESTDATA = os.path.join(os.path.dirname(__file__), "testdata")
GREETER_ABI = os.path.join(TESTDATA, "Greeter.abi")
GREETER_BIN = os.path.join(TESTDATA, "Greeter.bin")
GREETER_SOL = os.path.join(TESTDATA, "Greeter.sol")


def compiled_test_contract():
    if not os.path.exists(GREETER_ABI):
        # pylint: disable=import-outside-toplevel
        import solcx  # type: ignore

        with open(GREETER_SOL, "r", encoding="utf-8") as handle:
            solcx.install_solc(version="0.8.9")
            solcx.set_solc_version("0.8.9")
            compiled_sol = solcx.compile_source(
                handle.read(), output_values=["abi", "bin"]
            )
            _, contract_interface = compiled_sol.popitem()
        with open(GREETER_ABI, "w", encoding="utf-8") as handle:
            json.dump(contract_interface["abi"], handle)
        with open(GREETER_BIN, "w", encoding="utf-8") as handle:
            json.dump(contract_interface["bin"], handle)
        return {
            "abi": contract_interface["abi"],
            "bin": contract_interface["bin"],
        }
    with open(GREETER_ABI, "rb") as abi_handle:
        with open(GREETER_BIN, "rb") as bin_handle:
            return {"abi": json.load(abi_handle), "bin": json.load(bin_handle)}


class TestEndToEnd(unittest.TestCase):
    greeter: Union[Contract, Type[Contract]]
    w3: Web3

    def setUp(self):
        account: LocalAccount = Account.from_key(  # pylint: disable=no-value-for-parameter
            "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
        )

        w3 = Web3(Web3.HTTPProvider("http://localhost:8545"))
        # w3 = Web3(Web3.HTTPProvider('https://testnet.sapphire.oasis.io'))
        w3.middleware_onion.add(
            SignAndSendRawMiddlewareBuilder.build(account)  # pylint: disable=no-value-for-parameter
        )
        self.w3_no_signer = Web3(Web3.HTTPProvider("http://localhost:8545"))
        self.w3_no_signer_wrapped = sapphire.wrap(Web3(Web3.HTTPProvider("http://localhost:8545")))
        self.w3 = sapphire.wrap(w3, account)

        self.w3.eth.default_account = account.address

        iface = compiled_test_contract()

        contract = self.w3.eth.contract(abi=iface["abi"], bytecode=iface["bin"])
        tx_hash = contract.constructor().transact({"gasPrice": self.w3.eth.gas_price})
        tx_receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)

        self.greeter = self.w3.eth.contract(
            address=tx_receipt["contractAddress"], abi=iface["abi"]
        )
        self.greeter_no_signer = self.w3_no_signer.eth.contract(
            address=tx_receipt["contractAddress"], abi=iface["abi"]
        )
        self.greeter_no_signer_wrapped = self.w3_no_signer_wrapped.eth.contract(
            address=tx_receipt["contractAddress"], abi=iface["abi"]
        )

    def test_viewcall_revert_custom(self):
        with self.assertRaises(ContractCustomError) as cm:
            self.greeter.functions.revertWithCustomError().call()

        error_signature = "MyCustomError(string)"
        selector = function_signature_to_4byte_selector(error_signature)
        error_data = self.w3.codec.encode(["string"], ["thisIsCustom"])
        data = selector + error_data

        self.assertEqual(cm.exception.args[0], f"0x{data.hex()}")

    def test_viewcall_revert_reason(self):
        with self.assertRaises(ContractLogicError) as cm:
            self.greeter.functions.revertWithReason().call()
        self.assertEqual(cm.exception.message, "execution reverted: reasonGoesHere")

    def test_viewcall(self):
        self.assertEqual(self.greeter.functions.greet().call(), "Hello")

    def test_viewcall_only_owner(self):
        self.assertEqual(self.greeter.functions.greetOnlyOwner().call(), "Hello")

    def test_viewcall_only_owner_no_signer(self):
        with self.assertRaises(ContractLogicError) as cm:
            self.greeter_no_signer.functions.greetOnlyOwner().call()
        self.assertEqual(
            cm.exception.message,
            "execution reverted: Only owner can call this function",
        )

    def test_transaction(self):
        w3 = self.w3
        greeter = self.greeter

        x = self.greeter.functions.blah().transact({"gasPrice": w3.eth.gas_price})
        y = w3.eth.wait_for_transaction_receipt(x)
        z = greeter.events.Greeting().process_receipt(y)
        self.assertEqual(z[0].args["g"], "Hello")

    def test_transaction_no_signer_wrapped(self):
        greeter = self.greeter_no_signer_wrapped

        self.assertEqual(greeter.functions.greet().call(), "Hello")


if __name__ == "__main__":
    unittest.main()
