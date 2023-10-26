from typing import Any, Callable, cast, TypedDict
from binascii import unhexlify, hexlify

from web3 import Web3
from web3.types import RPCEndpoint, RPCResponse, TxParams
from eth_typing import HexStr

from .cipher import TransactionEncrypter

# Should transactions which deploy contracts be encrypted?
ENCRYPT_DEPLOYS = False

# Number of epochs to keep from the latest one
EPOCH_LIMIT = 5

class CalldataPublicKey(TypedDict):
    epoch: int
    checksum: bytes
    signature: bytes
    key: bytes

class CalldataPublicKeyManager:
    _keys: list[CalldataPublicKey]
    def __init__(self):
        self._keys = list()

    def _trim_and_sort(self, latestEpoch:int):
        self._keys = sorted([v for v in self._keys
                             if v['epoch'] >= latestEpoch - EPOCH_LIMIT],
                            key=lambda o: o['epoch'])

    @property
    def newest(self):
        if len(self._keys):
            return self._keys[-1]

    def add(self, pk:CalldataPublicKey):
        if len(self._keys):
            if self.newest['epoch'] < pk['epoch']:
                self._keys.append(pk)
            self._trim_and_sort(pk['epoch'])
        else:
            self._keys.append(pk)

def _shouldIntercept(method: RPCEndpoint, params: Any):
    if not ENCRYPT_DEPLOYS:
        if method in ('eth_sendTransaction', 'eth_estimateGas'):
            # When 'to' flag is missing, we assume it's a deployment
            if params[0].get('to', '') == '':
                return False
    return method in ('eth_estimateGas', 'eth_sendTransaction', 'eth_call')

def _encryptRequestParams(key: str, params: tuple[TxParams]):
    c = TransactionEncrypter(key)
    data = params[0]['data']
    if isinstance(data, bytes):
        dataBytes = data
    elif isinstance(data, str):
        if len(data) < 2 or data[:2] != '0x':
            raise RuntimeError('Data is not hex encoded!', data)
        dataBytes = unhexlify(data[2:])
    else:
        raise TypeError("Invalid 'data' type", type(data))
    encryptedData = c.encrypt(dataBytes)
    params[0]['data'] = HexStr('0x' + hexlify(encryptedData).decode('ascii'))
    return c

def sapphire_middleware(
    make_request: Callable[[RPCEndpoint, Any], Any], w3: "Web3"
) -> Callable[[RPCEndpoint, Any], RPCResponse]:
    manager = CalldataPublicKeyManager()
    def middleware(method: RPCEndpoint, params: Any) -> RPCResponse:
        if _shouldIntercept(method, params):
            pk = manager.newest
            if not pk:
                # If no calldata public key exists, fetch one
                cdpk = cast(RPCResponse, make_request(RPCEndpoint('oasis_callDataPublicKey'), []))
                pk = cast(CalldataPublicKey|None, cdpk.get('result', None))
                if pk:
                    manager.add(pk)
            if not pk:
                raise RuntimeError('Could not retrieve callDataPublicKey!')

            c = _encryptRequestParams(pk['key'], params)
            print('Submitting encrypted', method, params)

            result = make_request(method, params)

            # Only eth_call is decrypted
            if method == 'eth_call' and result.get('data', '0x') != '0x':
                print('Decrypting Result', method, result)
                resultData = result['data']
                resultDataBytes = unhexlify(resultData[2:])
                decryptedResultData = c.decrypt(resultDataBytes)
                result['data'] = '0x' + hexlify(decryptedResultData).decode('ascii')

            print('Got Result', method, result)
            return result
        return make_request(method, params)
    return middleware

def wrap(w3: Web3):
    if 'sapphire' not in w3.middleware_onion:
        w3.middleware_onion.add(sapphire_middleware, "sapphire")
    return w3
