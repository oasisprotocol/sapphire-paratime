from typing import Any, Callable, cast, TypedDict, Optional
from binascii import unhexlify, hexlify

import cbor2
from web3 import Web3
from web3.types import RPCEndpoint, RPCResponse, TxParams, Middleware
from eth_typing import HexStr
from eth_account import Account
from typing import (
    Any,
    Callable,
    Collection,
    Union,
)
from eth_account.signers.local import (
    LocalAccount,
)

from .envelope import TransactionCipher

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
        self._keys = sorted([v for v in self._keys
                             if v['epoch'] >= newest_epoch - EPOCH_LIMIT],
                            key=lambda o: o['epoch'])[-EPOCH_LIMIT:]

    @property
    def newest(self):
        if self._keys:
            return self._keys[-1]
        return None

    def add(self, pk: CalldataPublicKey):
        if self._keys:
            if self.newest['epoch'] < pk['epoch']:
                self._keys.append(pk)
            self._trim_and_sort(pk['epoch'])
        else:
            self._keys.append(pk)


def _should_intercept(method: RPCEndpoint, params: tuple[TxParams]):
    if not ENCRYPT_DEPLOYS:
        if method in ('eth_sendTransaction', 'eth_estimateGas'):
            # When 'to' flag is missing, we assume it's a deployment
            if not params[0].get('to', None):
                return False
    return method in ('eth_estimateGas', 'eth_sendTransaction', 'eth_call')


def _encrypt_tx_params(pk: CalldataPublicKey,
                       params: tuple[TxParams],
                       web3: Web3,
                       account: LocalAccount) -> TransactionCipher:
    c = TransactionCipher(peer_pubkey=pk['key'], peer_epoch=pk['epoch'])
    data = params[0]['data']
    if isinstance(data, bytes):
        data_bytes = data
    elif isinstance(data, str):
        if len(data) < 2 or data[:2] != '0x':
            raise ValueError('Data is not hex encoded!', data)
        # Testing
        data_bytes = unhexlify(data[2:])
    else:
        raise TypeError("Invalid 'data' type", type(data))
    encrypted_data = c.encrypt(data_bytes)

    if params[0]['from']:  # and params[0]['from'] == account.address:
        data_pack = _new_signed_call_data_pack(encrypted_data,
                                               data_bytes,
                                               params,
                                               web3,
                                               account)
        params[0]['data'] = HexStr('0x' + hexlify(cbor2.dumps(data_pack)).decode('ascii'))
        # params[0]['data'] = '0x' + params[0]['data'].hex()
    else:
        params[0]['data'] = HexStr('0x' + hexlify(encrypted_data).decode('ascii'))
    return c


def _new_signed_call_data_pack(encrypted_data: bytes,
                               data_bytes: bytes,
                               params: tuple[TxParams],
                               web3: Web3,
                               account: LocalAccount) -> dict:
    # Update params with default values, these get used outside the scope of this function
    params[0]['gas'] = params[0].get('gas', DEFAULT_GAS_LIMIT)
    params[0]['gasPrice'] = params[0].get('gasPrice', DEFAULT_GAS_PRICE)

    domain_data = {
        "name": "oasis-runtime-sdk/evm: signed query",
        "version": "1.0.0",
        "chainId": web3.eth.chain_id,
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
            {"name": "block_number", "type": "uint64"},
            {"name": "block_hash", "type": "bytes32"},
            {"name": "block_range", "type": "uint64"},
        ],
    }
    nonce = web3.eth.get_transaction_count(params[0]['from'])
    block_number = web3.eth.block_number
    block_hash = web3.eth.get_block(block_number)['hash'].hex()
    msg_data = {
        "from": params[0].get('from'),
        "to": params[0].get('to'),
        "value": params[0].get('value', 0),
        "gasLimit": params[0].get('gas', DEFAULT_GAS_LIMIT),
        "gasPrice": params[0].get('gasPrice', DEFAULT_GAS_PRICE),
        "data": data_bytes,
        "leash":
            {
                "nonce": nonce,
                "block_number": block_number - 1,
                "block_hash": unhexlify(block_hash[2:]),
                "block_range": DEFAULT_BLOCK_RANGE,
            }
    }

    # Testing
    domain_data_test = {
        "name": "oasis-runtime-sdk/evm: signed query",
        "version": "1.0.0",
        "chainId": 0x5aff,
        # "verifyingContract": "",
        # "salt": "",
    }

    msg_data_test = {
        "from": '0xDce075E1C39b1ae0b75D554558b6451A226ffe00',
        # "to": params[0].get('to', '0x'),
        "to": '0x595cce2312b7dfb068eb7dbb8c2b0b593b5c8883',
        "value": params[0].get('value', 0),
        "gasLimit": params[0].get('gas', DEFAULT_GAS_LIMIT),
        "gasPrice": params[0].get('gasPrice', DEFAULT_GAS_PRICE),
        "data": unhexlify('e21f37ce'),
        "leash":
            {
                "nonce": 0x12,
                "blockNumber": 0x1234,
                "blockHash": unhexlify('2ec361fee28d09a3ad2c4d5f7f95d409ce2b68c39b5d647edf0ea651e069e4a8'),
                "blockRange": 15,
            }
    }
    full_message = {
        "types": msg_types,
        "primaryType": "Call",
        "domain": domain_data,
        "message": msg_data,
    }

    # sign the message with the private key:
    signed_msg = Account.sign_typed_data(account.key,
                                         full_message=full_message)

    # Testing
    # signed_msg = Account.sign_typed_data('c07b151fbc1e7a11dff926111188f8d872f62eba0396da97c0a24adb75161750', full_message=full_message)
    # signed_msg = Account.sign_typed_data('c07b151fbc1e7a11dff926111188f8d872f62eba0396da97c0a24adb75161750',
    #                                      domain_data, msg_types, msg_data)

    # leash = {
    #     "nonce": nonce,
    #     "block_number": block_number - 1,
    #     "block_hash": unhexlify(block_hash[2:]),
    #     "block_range": DEFAULT_BLOCK_RANGE,
    # }
    leash = msg_data['leash']

    class RequestPack(TypedDict):
        Data: bytes
        Leash: dict
        Signature: HexStr

    data_pack: RequestPack = {
        'data': cbor2.loads(encrypted_data),
        'leash': leash,
        'signature': signed_msg['signature'],
    }
    return data_pack


def construct_sapphire_middleware(
        account: LocalAccount = None
) -> Middleware:
    """
    Construct a Sapphire middleware for Web3.py.
    :param account: Used to encrypt signed queries.
    :return: A Sapphire middleware function.
    """

    def sapphire_middleware(
            make_request: Callable[[RPCEndpoint, Any], Any], w3: "Web3"
    ) -> Callable[[RPCEndpoint, Any], RPCResponse]:
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

        def middleware(method: RPCEndpoint, params: Any) -> RPCResponse:
            if _should_intercept(method, params):
                do_fetch = True
                pk = manager.newest
                while do_fetch:
                    if not pk:
                        # If no calldata public key exists, fetch one
                        cdpk = cast(RPCResponse, make_request(RPCEndpoint('oasis_callDataPublicKey'), []))
                        pk = cast(Optional[CalldataPublicKey], cdpk.get('result', None))
                        if pk:
                            manager.add(pk)
                    if not pk:
                        raise RuntimeError('Could not retrieve callDataPublicKey!')
                    do_fetch = False

                    c = _encrypt_tx_params(pk, params, w3, account)

                    # We may encounter three errors here:
                    #  'core: invalid call format: epoch too far in the past'
                    #  'core: invalid call format: Tag verification failed'
                    #  'core: invalid call format: epoch in the future'
                    # We can only do something meaningful with the first!
                    result = cast(RPCResponse, make_request(method, params))
                    if result.get('error', None) is not None:
                        error = result['error']
                        if not isinstance(error, str) and error['code'] == -32000:
                            if error['message'] == 'core: invalid call format: epoch too far in the past':
                                # force the re-fetch, and encrypt with new key
                                do_fetch = True
                                pk = None
                                continue

                # Only eth_call is decrypted
                if method == 'eth_call' and result.get('result', '0x') != '0x':
                    decrypted = c.decrypt(unhexlify(result['result'][2:]))
                    result['result'] = HexStr('0x' + hexlify(decrypted).decode('ascii'))

                return result
            return make_request(method, params)

        return middleware

    return sapphire_middleware


def wrap(w3: Web3, account: LocalAccount = None):
    """
    Adds the Sapphire transaction encryption middleware to a Web3.py provider.

    Note: the provider must be wrapped *after* any signing middleware has been
          added, otherwise pre-signed transactions will not be encrypted.
    """
    if 'sapphire' not in w3.middleware_onion:
        w3.middleware_onion.add(construct_sapphire_middleware(account), "sapphire")
    return w3
