from typing import Any, Callable, cast, TypedDict, Optional
from binascii import unhexlify, hexlify

from web3 import Web3
from web3.types import RPCEndpoint, RPCResponse, TxParams
from eth_typing import HexStr

from .envelope import TransactionCipher

# Should transactions which deploy contracts be encrypted?
ENCRYPT_DEPLOYS = False

# Number of epochs to keep public keys for
EPOCH_LIMIT = 5

class CalldataPublicKey(TypedDict):
    epoch: int
    checksum: HexStr
    signature: HexStr
    key: HexStr

class CalldataPublicKeyManager:
    _keys: list[CalldataPublicKey]
    def __init__(self):
        self._keys = []

    def _trim_and_sort(self, newest_epoch:int):
        self._keys = sorted([v for v in self._keys
                             if v['epoch'] >= newest_epoch - EPOCH_LIMIT],
                            key=lambda o: o['epoch'])[-EPOCH_LIMIT:]

    @property
    def newest(self):
        if self._keys:
            return self._keys[-1]
        return None

    def add(self, pk:CalldataPublicKey):
        if self._keys:
            if self.newest['epoch'] < pk['epoch']:
                self._keys.append(pk)
            self._trim_and_sort(pk['epoch'])
        else:
            self._keys.append(pk)

def _should_intercept(method: RPCEndpoint, params:tuple[TxParams]):
    if not ENCRYPT_DEPLOYS:
        if method in ('eth_sendTransaction', 'eth_estimateGas'):
            # When 'to' flag is missing, we assume it's a deployment
            if not params[0].get('to', None):
                return False
    return method in ('eth_estimateGas', 'eth_sendTransaction', 'eth_call')

def _encrypt_tx_params(pk:CalldataPublicKey, params:tuple[TxParams]):
    c = TransactionCipher(peer_pubkey=pk['key'], peer_epoch=pk['epoch'])
    data = params[0]['data']
    if isinstance(data, bytes):
        data_bytes = data
    elif isinstance(data, str):
        if len(data) < 2 or data[:2] != '0x':
            raise ValueError('Data is not hex encoded!', data)
        data_bytes = unhexlify(data[2:])
    else:
        raise TypeError("Invalid 'data' type", type(data))
    encrypted_data = c.encrypt(data_bytes)
    params[0]['data'] = HexStr('0x' + hexlify(encrypted_data).decode('ascii'))
    return c

def sapphire_middleware(
    make_request: Callable[[RPCEndpoint, Any], Any], _: "Web3"
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

                c = _encrypt_tx_params(pk, params)

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

def wrap(w3: Web3):
    if 'sapphire' not in w3.middleware_onion:
        w3.middleware_onion.add(sapphire_middleware, "sapphire")
    return w3
