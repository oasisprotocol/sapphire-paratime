import unittest
import asyncio
import time
from typing import Type, Union

from web3 import Web3, AsyncWeb3
from web3.exceptions import ContractLogicError, ContractCustomError
from web3.contract.contract import Contract
from web3.middleware import SignAndSendRawMiddlewareBuilder
from eth_account import Account
from eth_account.signers.local import LocalAccount
from eth_utils import function_signature_to_4byte_selector

from sapphirepy import sapphire

from .test_e2e import compiled_test_contract


class AsyncTestEndToEnd(unittest.IsolatedAsyncioTestCase):
    """Async tests for Sapphire middleware with AsyncWeb3."""

    contract: Union[Contract, Type[Contract]]
    w3: AsyncWeb3

    # Also store sync instances for performance comparison
    sync_greeter: Union[Contract, Type[Contract]]
    sync_w3: Web3

    async def asyncSetUp(self):
        """Set up both async and sync Web3 instances for testing."""
        # Use the same key for both instances
        account: LocalAccount = (
            Account.from_key(  # pylint: disable=no-value-for-parameter
                private_key="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
            )
        )

        # Set up async Web3
        w3_async = AsyncWeb3(AsyncWeb3.AsyncHTTPProvider("http://localhost:8545"))
        w3_async.middleware_onion.add(
            SignAndSendRawMiddlewareBuilder.build(account)  # pylint: disable=no-value-for-parameter
        )
        self.w3_async_no_signer = AsyncWeb3(
            AsyncWeb3.AsyncHTTPProvider("http://localhost:8545")
        )
        self.w3_async = sapphire.wrap(w3_async, account)
        self.w3_async.eth.default_account = account.address

        # Deploy the contract using async Web3
        iface = compiled_test_contract()
        contract = self.w3_async.eth.contract(abi=iface["abi"], bytecode=iface["bin"])
        tx_hash = await contract.constructor().transact(
            {"gasPrice": await self.w3_async.eth.gas_price}
        )
        tx_receipt = await self.w3_async.eth.wait_for_transaction_receipt(tx_hash)
        contract_address = tx_receipt["contractAddress"]

        # Create contract instances for both async and sync Web3
        self.async_greeter = self.w3_async.eth.contract(
            address=contract_address, abi=iface["abi"]
        )
        self.async_greeter_no_signer = self.w3_async_no_signer.eth.contract(
            address=contract_address, abi=iface["abi"]
        )

    async def asyncTearDown(self):
        """Clean up async resources."""
        if hasattr(self, "w3_async"):
            await self.w3_async.provider.disconnect()
        if hasattr(self, "w3_async_no_signer"):
            await self.w3_async_no_signer.provider.disconnect()

    # Async versions of the tests in test_e2e.py
    async def test_viewcall_revert_custom(self):
        with self.assertRaises(ContractCustomError) as cm:
            await self.async_greeter.functions.revertWithCustomError().call()

        error_signature = "MyCustomError(string)"
        selector = function_signature_to_4byte_selector(error_signature)
        error_data = self.w3_async.codec.encode(["string"], ["thisIsCustom"])
        data = selector + error_data

        self.assertEqual(cm.exception.args[0], "0x" + data.hex())

    async def test_viewcall_revert_reason(self):
        with self.assertRaises(ContractLogicError) as cm:
            await self.async_greeter.functions.revertWithReason().call()
        self.assertEqual(cm.exception.message, "execution reverted: reasonGoesHere")

    async def test_viewcall(self):
        result = await self.async_greeter.functions.greet().call()
        self.assertEqual(result, "Hello")

    async def test_viewcall_only_owner(self):
        result = await self.async_greeter.functions.greetOnlyOwner().call()
        self.assertEqual(result, "Hello")

    async def test_viewcall_only_owner_no_signer(self):
        with self.assertRaises(ContractLogicError) as cm:
            await self.async_greeter_no_signer.functions.greetOnlyOwner().call()
        self.assertEqual(
            cm.exception.message,
            "execution reverted: Only owner can call this function",
        )

    async def test_transaction(self):
        x = await self.async_greeter.functions.blah().transact(
            {"gasPrice": await self.w3_async.eth.gas_price}
        )
        y = await self.w3_async.eth.wait_for_transaction_receipt(x)
        z = self.async_greeter.events.Greeting().process_receipt(y)
        self.assertEqual(z[0].args["g"], "Hello")


class TestPerformanceComparison(unittest.IsolatedAsyncioTestCase):
    """Performance comparison between sync and async Web3."""

    async def asyncSetUp(self):
        # Set up accounts
        self.account = Account.from_key(  # pylint: disable=no-value-for-parameter
            "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
        )

        # Set up providers
        self.sync_w3 = Web3(Web3.HTTPProvider("http://localhost:8545"))
        self.sync_w3.middleware_onion.add(
            SignAndSendRawMiddlewareBuilder.build(self.account)  # pylint: disable=no-value-for-parameter
        )
        self.sync_w3 = sapphire.wrap(self.sync_w3, self.account)
        self.sync_w3.eth.default_account = self.account.address

        self.async_w3 = AsyncWeb3(
            AsyncWeb3.AsyncHTTPProvider("http://localhost:8545")
        )
        # self.async_w3 = AsyncWeb3(AsyncWeb3.AsyncHTTPProvider('https://testnet.sapphire.oasis.io'))
        self.async_w3.middleware_onion.add(
            SignAndSendRawMiddlewareBuilder.build(self.account)  # pylint: disable=no-value-for-parameter
        )
        self.async_w3 = sapphire.wrap(self.async_w3, self.account)
        self.async_w3.eth.default_account = self.account.address

        # Deploy contract for contract call tests
        iface = compiled_test_contract()
        contract = self.async_w3.eth.contract(abi=iface["abi"], bytecode=iface["bin"])
        tx_hash = await contract.constructor().transact(
            {"gasPrice": await self.async_w3.eth.gas_price}
        )
        tx_receipt = await self.async_w3.eth.wait_for_transaction_receipt(tx_hash)
        contract_address = tx_receipt["contractAddress"]

        self.sync_contract = self.sync_w3.eth.contract(
            address=contract_address, abi=iface["abi"]
        )
        self.async_contract = self.async_w3.eth.contract(
            address=contract_address, abi=iface["abi"]
        )

    async def asyncTearDown(self):
        """Clean up async resources."""
        if hasattr(self, "async_w3"):
            await self.async_w3.provider.disconnect()

    async def test_performance(self):
        """Compare performance between sync and async operations."""
        batch_sizes = [1, 2, 5]

        print("\nPerformance Comparison: Sync vs Async Web3")
        print("------------------------------------------")

        for batch_size in batch_sizes:
            # RPC call performance (block number)
            sync_time = await self._measure_sync_batch(batch_size)
            async_time = await self._measure_async_batch(batch_size)

            speedup = sync_time / async_time if async_time > 0 else float("inf")

            print(f"\nBatch Size: {batch_size} requests")
            print(f"  Sync RPC Time:  {sync_time:.4f} seconds")
            print(f"  Async RPC Time: {async_time:.4f} seconds")
            print(f"  Speedup:        {speedup:.2f}x")

            # For larger batches, async should be noticeably faster
            # if batch_size >= 10:
            #     self.assertGreater(speedup, 1.0,
            #                       f"Expected async to be faster for batch size {batch_size}")

        # Contract call performance
        await self._compare_contract_calls()
        await self.async_w3.provider.disconnect()

    async def _measure_sync_batch(self, num_requests: int) -> float:
        """Measure time to execute a batch of sync block number requests."""
        start_time = time.time()

        for _ in range(num_requests):
            self.sync_contract.functions.greet().call()
            time.sleep(0.1)

        end_time = time.time()
        return end_time - start_time

    async def _measure_async_batch(self, num_requests: int) -> float:
        """Measure time to execute a batch of async block number requests concurrently."""
        start_time = time.time()

        tasks = []
        for _ in range(num_requests):
            tasks.append(
                asyncio.gather(
                    self.async_contract.functions.greet().call(), asyncio.sleep(0.1)
                )
            )

        await asyncio.gather(*tasks)

        end_time = time.time()
        return end_time - start_time

    async def _compare_contract_calls(self):
        """Compare contract call performance between sync and async."""
        print("\nContract Call Performance:")

        # Measure sync contract calls
        start_time = time.time()
        for _ in range(100):
            self.sync_contract.functions.greet().call()
            time.sleep(0.1)
        sync_time = time.time() - start_time

        # Measure async contract calls
        start_time = time.time()
        tasks = []
        for _ in range(100):
            # tasks.append(self.async_contract.functions.greet().call())
            tasks.append(
                asyncio.gather(
                    self.async_contract.functions.greet().call(), asyncio.sleep(0.1)
                )
            )
        await asyncio.gather(*tasks)
        async_time = time.time() - start_time

        speedup = sync_time / async_time if async_time > 0 else float("inf")

        print(f"  Sync Contract Calls:  {sync_time:.4f} seconds")
        print(f"  Async Contract Calls: {async_time:.4f} seconds")
        print(f"  Speedup:              {speedup:.2f}x")

        self.assertGreater(speedup, 1.0, "Expected async contract calls to be faster")


if __name__ == "__main__":
    unittest.main()
