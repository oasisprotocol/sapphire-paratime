from binascii import unhexlify, hexlify
from typing import Any, cast, Optional, TypedDict, Union
from toolz import (  # type: ignore
    curry,
)
import cbor2
from web3 import (  # noqa: F401
    AsyncWeb3,
    Web3,
)
from web3.types import (  # noqa: F401
    AsyncMakeRequestFn,
    MakeRequestFn,
    RPCEndpoint,
    RPCResponse,
    BlockData,
    Coroutine,
)
from web3.middleware.base import (
    Web3MiddlewareBuilder,
)
from eth_typing import HexStr
from eth_account import Account
from eth_account.signers.local import LocalAccount

from .envelope import TransactionCipher

NETWORKS = {
    "sapphire": "https://sapphire.oasis.io",
    "sapphire-testnet": "https://testnet.sapphire.oasis.io",
    "sapphire-localnet": "http://localhost:8545",
}

# Should transactions which deploy contracts be encrypted?
ENCRYPT_DEPLOYS = False

# Number of epochs to keep public keys for
EPOCH_LIMIT = 5
# Default gas price
DEFAULT_GAS_PRICE = 100_000_000_000
# Default gas limit
DEFAULT_GAS_LIMIT = 30_000_000
# Default block range
DEFAULT_BLOCK_RANGE = 15


class CalldataPublicKey(TypedDict):
    epoch: int
    checksum: HexStr
    signature: HexStr
    key: HexStr


class CalldataPublicKeyManager:
    _keys: list[CalldataPublicKey]

    def __init__(self):
        self._keys = []

    def _trim_and_sort(self, newest_epoch: int):
        self._keys = sorted(
            [v for v in self._keys if v["epoch"] >= newest_epoch - EPOCH_LIMIT],
            key=lambda o: o["epoch"],
        )[-EPOCH_LIMIT:]

    @property
    def newest(self):
        if self._keys:
            return self._keys[-1]
        return None

    def add(self, pk: CalldataPublicKey):
        if self._keys:
            if self.newest["epoch"] < pk["epoch"]:
                self._keys.append(pk)
            self._trim_and_sort(pk["epoch"])
        else:
            self._keys.append(pk)


def _should_intercept(method: RPCEndpoint, params: Any):
    if not ENCRYPT_DEPLOYS:
        if method in ("eth_sendTransaction", "eth_estimateGas"):
            # When 'to' flag is missing, we assume it's a deployment
            if not params[0].get("to", None):
                return False
    return method in ("eth_estimateGas", "eth_sendTransaction", "eth_call")


def _encrypt_tx_params(
    pk: CalldataPublicKey,
    params: Any,
    account: Optional[LocalAccount] = None,
    signed_call_data: Optional[dict] = None,
) -> TransactionCipher:
    c = TransactionCipher(peer_pubkey=pk["key"], peer_epoch=pk["epoch"])
    data = params[0]["data"]
    if isinstance(data, bytes):
        data_bytes = data
    elif isinstance(data, str):
        if len(data) < 2 or data[:2] != "0x":
            raise ValueError("Data is not hex encoded!", data)
        data_bytes = unhexlify(data[2:])
    else:
        raise TypeError("Invalid 'data' type", type(data))
    encrypted_data = c.encrypt(data_bytes)

    if signed_call_data and account:
        data_pack = _new_signed_call_data_pack(
            c.make_envelope(data_bytes), data_bytes, params, account, signed_call_data
        )
        params[0]["data"] = cbor2.dumps(data_pack, canonical=True)
    else:
        params[0]["data"] = HexStr("0x" + hexlify(encrypted_data).decode("ascii"))
    return c


def _new_signed_call_data_pack(
    encrypted_data: dict,
    data_bytes: bytes,
    params: Any,
    account: LocalAccount,
    signed_call_data: dict,
) -> dict:
    # Update params with default values, these get used outside the scope of this function
    params[0]["gas"] = int(params[0].get("gas", DEFAULT_GAS_LIMIT))
    params[0]["gasPrice"] = signed_call_data[
        "gas_price"
    ]  # web3.to_wei(params[0].get('gasPrice', DEFAULT_GAS_PRICE), 'wei')

    domain_data = {
        "name": "oasis-runtime-sdk/evm: signed query",
        "version": "1.0.0",
        "chainId": signed_call_data["chain_id"],
        # "verifyingContract": "",
        # "salt": "",
    }
    msg_types = {
        "EIP712Domain": [
            {"name": "name", "type": "string"},
            {"name": "version", "type": "string"},
            {"name": "chainId", "type": "uint256"},
        ],
        "Call": [
            {"name": "from", "type": "address"},
            {"name": "to", "type": "address"},
            {"name": "gasLimit", "type": "uint64"},
            {"name": "gasPrice", "type": "uint256"},
            {"name": "value", "type": "uint256"},
            {"name": "data", "type": "bytes"},
            {"name": "leash", "type": "Leash"},
        ],
        "Leash": [
            {"name": "nonce", "type": "uint64"},
            {"name": "blockNumber", "type": "uint64"},
            {"name": "blockHash", "type": "bytes32"},
            {"name": "blockRange", "type": "uint64"},
        ],
    }
    nonce = signed_call_data[
        "nonce"
    ]  # web3.eth.get_transaction_count(web3.to_checksum_address(params[0]['from']))
    block_number = signed_call_data["block_number"]  # web3.eth.block_number

    block_hash = signed_call_data[
        "block_hash"
    ]  # web3.eth.get_block(block_number - 1)['hash'].hex()
    if block_hash.startswith("0x"):
        block_hash = block_hash[2:]

    msg_data = {
        "from": params[0].get("from"),
        "to": params[0].get("to"),
        "value": params[0].get("value", 0),
        "gasLimit": params[0].get("gas", DEFAULT_GAS_LIMIT),
        "gasPrice": params[0].get("gasPrice", DEFAULT_GAS_PRICE),
        "data": data_bytes,
        "leash": {
            "nonce": nonce,
            "blockNumber": block_number - 1,
            "blockHash": unhexlify(block_hash),
            "blockRange": DEFAULT_BLOCK_RANGE,
        },
    }

    full_message = {
        "types": msg_types,
        "primaryType": "Call",
        "domain": domain_data,
        "message": msg_data,
    }

    # sign the message with the private key:
    signed_msg = Account().sign_typed_data(account.key, full_message=full_message)

    leash = {
        "nonce": nonce,
        "block_number": block_number - 1,
        "block_hash": unhexlify(block_hash),
        "block_range": DEFAULT_BLOCK_RANGE,
    }

    data_pack = {
        "data": encrypted_data,
        "leash": leash,
        "signature": bytes(signed_msg["signature"]),
    }
    params[0]["gas"] = hex(params[0]["gas"])
    params[0]["gasPrice"] = hex(params[0]["gasPrice"])
    return data_pack


class ConstructSapphireMiddlewareBuilder(Web3MiddlewareBuilder):
    """
    Construct a Sapphire middleware for Web3.py.
    :param account: Used to encrypt signed queries.
    :return: A Sapphire middleware function.
    """

    sapphire_account = None

    @staticmethod
    @curry
    def build(
        account: LocalAccount,
        w3: Union["Web3", "AsyncWeb3"],
    ) -> "ConstructSapphireMiddlewareBuilder":
        # pylint: disable=no-value-for-parameter,arguments-differ
        middleware = ConstructSapphireMiddlewareBuilder(w3)
        middleware.sapphire_account = account
        return middleware

    def wrap_make_request(self, make_request: "MakeRequestFn") -> "MakeRequestFn":
        """
        Transparently encrypt the calldata for:

         - eth_estimateGas
         - eth_sendTransaction
         - eth_call

        The calldata public key, which used to derive a shared secret with an
        ephemeral key, is retrieved upon the first request. This key is rotated by
        Sapphire every epoch, and only transactions encrypted with keys from the
        last 5 epochs are considered valid.

        Deployment transactions will not be encrypted, unless the global
        ENCRYPT_DEPLOYS flag is set. Encrypting deployments will prevent contracts
        from being verified.

        Pre-signed transactions can't be encrypted if submitted via this instance.
        """
        manager = CalldataPublicKeyManager()

        def middleware(method: "RPCEndpoint", params: Any) -> "RPCResponse":
            if _should_intercept(method, params):
                do_fetch = True
                pk = manager.newest
                while do_fetch:
                    if not pk:
                        # If no calldata public key exists, fetch one
                        cdpk = cast(
                            RPCResponse,
                            make_request(RPCEndpoint("oasis_callDataPublicKey"), []),
                        )
                        pk = cast(Optional[CalldataPublicKey], cdpk.get("result", None))
                        if pk:
                            manager.add(pk)
                    if not pk:
                        raise RuntimeError("Could not retrieve callDataPublicKey!")
                    do_fetch = False

                    if (
                        method == "eth_call"
                        and params[0]["from"]
                        and self.sapphire_account
                    ):
                        block_number = cast(int, self._w3.eth.block_number)
                        signed_call_data = {
                            "chain_id": self._w3.eth.chain_id,
                            "nonce": self._w3.eth.get_transaction_count(
                                self._w3.to_checksum_address(params[0]["from"])
                            ),
                            "block_number": block_number,
                            "block_hash": cast(
                                BlockData, self._w3.eth.get_block(block_number - 1)
                            )["hash"].hex(),
                            "gas_price": self._w3.to_wei(
                                params[0].get("gasPrice", DEFAULT_GAS_PRICE), "wei"
                            ),
                        }
                        c = _encrypt_tx_params(
                            pk, params, self.sapphire_account, signed_call_data
                        )
                    else:
                        c = _encrypt_tx_params(pk, params, self.sapphire_account)

                    # We may encounter three errors here:
                    #  'core: invalid call format: epoch too far in the past'
                    #  'core: invalid call format: Tag verification failed'
                    #  'core: invalid call format: epoch in the future'
                    # We can only do something meaningful with the first!
                    result = cast(RPCResponse, make_request(method, params))
                    if result.get("error", None) is not None:
                        error = result["error"]
                        if not isinstance(error, str) and error["code"] == -32000:
                            if (
                                error["message"]
                                == "core: invalid call format: epoch too far in the past"
                            ):
                                # force the re-fetch, and encrypt with new key
                                do_fetch = True
                                pk = None
                                continue

                # Only eth_call is decrypted
                if method == "eth_call" and result.get("result", "0x") != "0x":
                    decrypted = c.decrypt(unhexlify(result["result"][2:]))
                    result["result"] = HexStr("0x" + hexlify(decrypted).decode("ascii"))

                return result
            return make_request(method, params)

        return middleware

    async def async_wrap_make_request(
        self, make_request: "AsyncMakeRequestFn"
    ) -> "AsyncMakeRequestFn":
        """
        Async version of wrap_make_request that handles the same encryption logic
        for eth_estimateGas, eth_sendTransaction, and eth_call
        """
        manager = CalldataPublicKeyManager()

        async def middleware(method: "RPCEndpoint", params: Any) -> "RPCResponse":
            if _should_intercept(method, params):
                do_fetch = True
                pk = manager.newest
                while do_fetch:
                    if not pk:
                        # If no calldata public key exists, fetch one
                        cdpk = cast(
                            RPCResponse,
                            await make_request(
                                RPCEndpoint("oasis_callDataPublicKey"), []
                            ),
                        )
                        pk = cast(Optional[CalldataPublicKey], cdpk.get("result", None))
                        if pk:
                            manager.add(pk)
                    if not pk:
                        raise RuntimeError("Could not retrieve callDataPublicKey!")
                    do_fetch = False

                    if (
                        method == "eth_call"
                        and params[0]["from"]
                        and self.sapphire_account
                    ):
                        block_number = await cast(
                            Coroutine[Any, Any, int], self._w3.eth.block_number
                        )
                        signed_call_data = {
                            "chain_id": await cast(
                                Coroutine[Any, Any, int], self._w3.eth.chain_id
                            ),
                            "nonce": await cast(
                                Coroutine[Any, Any, int],
                                self._w3.eth.get_transaction_count(
                                    self._w3.to_checksum_address(params[0]["from"])
                                ),
                            ),
                            "block_number": block_number,
                            "block_hash": (
                                await cast(
                                    Coroutine[Any, Any, BlockData],
                                    self._w3.eth.get_block(block_number - 1),
                                )
                            )["hash"].hex(),
                            "gas_price": self._w3.to_wei(
                                params[0].get("gasPrice", DEFAULT_GAS_PRICE), "wei"
                            ),
                        }
                        c = _encrypt_tx_params(
                            pk, params, self.sapphire_account, signed_call_data
                        )
                    else:
                        c = _encrypt_tx_params(pk, params, self.sapphire_account)

                    # Handle the same three potential errors as sync version
                    result = cast(RPCResponse, await make_request(method, params))
                    if result.get("error", None) is not None:
                        error = result["error"]
                        if not isinstance(error, str) and error["code"] == -32000:
                            if (
                                error["message"]
                                == "core: invalid call format: epoch too far in the past"
                            ):
                                # force the re-fetch, and encrypt with new key
                                do_fetch = True
                                pk = None
                                continue

                # Only eth_call is decrypted
                if method == "eth_call" and result.get("result", "0x") != "0x":
                    decrypted = c.decrypt(unhexlify(result["result"][2:]))
                    result["result"] = HexStr("0x" + hexlify(decrypted).decode("ascii"))

                return result
            return await make_request(method, params)

        return middleware


def wrap(w3: Union[Web3, AsyncWeb3], account: Optional[LocalAccount] = None):
    """
    Adds the Sapphire transaction encryption middleware to a Web3.py provider.

    Note: the provider must be wrapped *after* any signing middleware has been
          added, otherwise pre-signed transactions will not be encrypted.
    """
    if "sapphire" not in w3.middleware_onion:
        w3.middleware_onion.add(
            ConstructSapphireMiddlewareBuilder.build(account), "sapphire"  # pylint: disable=no-value-for-parameter
        )
    return w3
