from typing import Optional, TypedDict, cast
from binascii import unhexlify

from os import urandom
from nacl.public import PrivateKey, Box, PublicKey
import cbor2

from .deoxysii import DeoxysII, NonceSize, TagSize

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
    ok: Optional[bytes]
    unknown: Optional[AeadEnvelope]

class SapphireBaseError(Exception):
    pass

class SapphireFailError(SapphireBaseError):
    pass

class SapphireUnknownError(SapphireBaseError):
    pass

class TransactionEncrypter:
    def __init__(self, peerPublicKey:PublicKey|str, sk:PrivateKey|None=None):
        if sk is None:
            sk = PrivateKey.generate()
        if isinstance(peerPublicKey, str):
            if len(peerPublicKey) != 66 or peerPublicKey[:2] != "0x":
                raise RuntimeError('peerPublicKey.invalid', peerPublicKey)
            peerPublicKey = PublicKey(unhexlify(peerPublicKey[2:]))
        box = Box(private_key=sk, public_key=peerPublicKey)
        self.myPublicKey = sk.public_key.encode()
        self.cipher = DeoxysII(box.shared_key())

    def _encryptCallData(self, calldata: bytes):
        nonce = urandom(NonceSize)
        plaintext = cbor2.dumps({'body': calldata})
        ciphertext = bytearray(len(plaintext) + TagSize)
        self.cipher.E(nonce=nonce, dst=ciphertext, ad=b"", msg=plaintext)
        return ciphertext, nonce

    def encrypt(self, plaintext: bytes):
        data, nonce = self._encryptCallData(plaintext)
        return cbor2.dumps({
            'body': {
                'nonce': nonce,
                'data': data,
                'pk': self.myPublicKey
            },
            'format': FORMAT_Encrypted_X25519DeoxysII
        })

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
        if callResult['failure']:
            raise SapphireFailError(callResult['failure'])
        ok = callResult.get('ok', None)
        if ok is not None:
            envelope = cast(AeadEnvelope, cbor2.loads(ok))
            return self._decryptInner(envelope)
        raise RuntimeError("No 'ok in call result!")
