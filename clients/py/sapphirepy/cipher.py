from typing import Optional, TypedDict, cast
from binascii import unhexlify
import hmac

from os import urandom
from nacl.bindings.crypto_scalarmult import crypto_scalarmult
from nacl.public import PrivateKey, PublicKey
import cbor2

from .deoxysii import DeoxysII, NonceSize, TagSize

###############################################################################
# CBOR encoded envelope formats

FORMAT_Encrypted_X25519DeoxysII = 1

class Failure(TypedDict):
    module: str
    code: int
    message: Optional[str]

class AeadEnvelope(TypedDict):
    nonce: bytes
    data: bytes

class ResultInner(TypedDict):
    fail: Failure
    ok: bytes

class ResultOuter(TypedDict):
    failure: Optional[Failure]
    ok: Optional[AeadEnvelope]
    unknown: Optional[AeadEnvelope]

class RequestBody(TypedDict):
    pk: bytes
    data: bytes
    nonce: bytes
    epoch: Optional[int]

class RequestEnvelope(TypedDict):
    body: dict
    format: int

###############################################################################
# Errors relating to encryption, decryption & envelope format

class SapphireBaseError(Exception):
    pass

class SapphireFailError(SapphireBaseError):
    pass

class SapphireUnknownError(SapphireBaseError):
    pass

###############################################################################

def _deriveSharedSecret(pk:PublicKey, sk:PrivateKey):
    key = b'MRAE_Box_Deoxys-II-256-128'
    msg = crypto_scalarmult(sk.encode(), pk._public_key)
    return hmac.new(key, msg, digestmod='sha512_256').digest()

class TransactionEncrypter:
    epoch:int|None
    cipher:DeoxysII
    myPublicKey:bytes
    def __init__(self, peerPublicKey:PublicKey|str, peerEpoch:int|None=None):
        if isinstance(peerPublicKey, str):
            if len(peerPublicKey) != 66 or peerPublicKey[:2] != "0x":
                raise RuntimeError('peerPublicKey.invalid', peerPublicKey)
            peerPublicKey = PublicKey(unhexlify(peerPublicKey[2:]))
        sk = PrivateKey.generate()
        self.myPublicKey = sk.public_key.encode()
        self.cipher = DeoxysII(_deriveSharedSecret(peerPublicKey, sk))
        self.epoch = peerEpoch

    def _encryptCallData(self, calldata: bytes):
        nonce = urandom(NonceSize)
        plaintext = cbor2.dumps({'body': calldata}, canonical=True)
        ciphertext = bytearray(len(plaintext) + TagSize)
        self.cipher.E(nonce=nonce, dst=ciphertext, ad=b"", msg=plaintext)
        return ciphertext, nonce

    def encrypt(self, plaintext: bytes):
        ciphertext, nonce = self._encryptCallData(plaintext)
        envelope:RequestEnvelope = {
            'body': {
                'pk': self.myPublicKey,
                'data': ciphertext,
                'nonce': nonce
            },
            'format': FORMAT_Encrypted_X25519DeoxysII
        }
        if self.epoch:
            envelope['body']['epoch'] = self.epoch
        return cbor2.dumps(envelope, canonical=True)

    def _decodeInner(self, plaintext:bytes) -> bytes:
        innerResult = cast(ResultInner, cbor2.loads(plaintext))
        if innerResult.get('ok', None) is not None:
            return innerResult['ok']
        raise SapphireFailError(innerResult['fail'])

    def _decryptInner(self, envelope: AeadEnvelope):
        plaintext = bytearray(len(envelope['data']) - TagSize)
        decryptOk = self.cipher.D(
            nonce=envelope['nonce'],
            dst=plaintext,
            ad=b"",
            ciphertext=envelope['data'])
        if not decryptOk:
            raise RuntimeError('Failed to decrypt')
        return self._decodeInner(plaintext)

    def decrypt(self, response: bytes):
        callResult = cast(ResultOuter, cbor2.loads(response))
        if callResult.get('failure', None) is not None:
            raise SapphireFailError(callResult['failure'])
        ok = callResult.get('ok', None)
        if ok is not None:
            return self._decryptInner(ok)
        raise RuntimeError("No 'ok in call result!")
