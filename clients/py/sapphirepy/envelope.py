from typing import Optional, TypedDict, cast
from binascii import unhexlify
import hmac

import cbor2
from nacl.bindings.crypto_scalarmult import crypto_scalarmult
from nacl.utils import random
from nacl.public import PrivateKey, PublicKey

from .deoxysii import DeoxysII, NONCE_SIZE, TAG_SIZE
from .error import SapphireError

###############################################################################
# CBOR encoded envelope formats

FORMAT_ENCRYPTED_X25519DEOXYSII = 1

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
    epoch: int

class RequestEnvelope(TypedDict):
    body: dict
    format: int

###############################################################################
# Errors relating to encryption, decryption & envelope format

class EnvelopeError(SapphireError):
    pass

class DecryptError(SapphireError):
    pass

class CallFailure(SapphireError):
    pass

###############################################################################

def _derive_shared_secret(pk:PublicKey, sk:PrivateKey):
    key = b'MRAE_Box_Deoxys-II-256-128'
    msg = crypto_scalarmult(sk.encode(), pk.encode())
    return hmac.new(key, msg, digestmod='sha512_256').digest()

class TransactionCipher:
    epoch:int
    cipher:DeoxysII
    ephemeral_pubkey:bytes

    def __init__(self, peer_pubkey:PublicKey|str, peer_epoch:int):
        if isinstance(peer_pubkey, str):
            if len(peer_pubkey) != 66 or peer_pubkey[:2] != "0x":
                raise ValueError('peerPublicKey.invalid', peer_pubkey)
            peer_pubkey = PublicKey(unhexlify(peer_pubkey[2:]))
        sk = PrivateKey.generate()
        self.ephemeral_pubkey = sk.public_key.encode()
        self.cipher = DeoxysII(_derive_shared_secret(peer_pubkey, sk))
        self.epoch = peer_epoch

    def _encrypt_calldata(self, calldata: bytes):
        nonce = random(NONCE_SIZE)
        plaintext = cbor2.dumps({'body': calldata}, canonical=True)
        ciphertext = bytearray(len(plaintext) + TAG_SIZE)
        self.cipher.E(nonce=nonce, dst=ciphertext, ad=None, msg=plaintext)
        return ciphertext, nonce

    def encrypt(self, plaintext: bytes):
        ciphertext, nonce = self._encrypt_calldata(plaintext)
        envelope:RequestEnvelope = {
            'body': {
                'pk': self.ephemeral_pubkey,
                'data': ciphertext,
                'nonce': nonce,
                'epoch': self.epoch
            },
            'format': FORMAT_ENCRYPTED_X25519DEOXYSII
        }
        return cbor2.dumps(envelope, canonical=True)

    def _decode_inner(self, plaintext:bytes) -> bytes:
        inner_result = cast(ResultInner, cbor2.loads(plaintext))
        if inner_result.get('ok', None) is not None:
            return inner_result['ok']
        raise CallFailure(inner_result['fail'])

    def _decrypt_inner(self, envelope: AeadEnvelope):
        plaintext = bytearray(len(envelope['data']) - TAG_SIZE)
        decrypt_ok = self.cipher.D(
            nonce=envelope['nonce'],
            dst=plaintext,
            ad=None,
            ciphertext=envelope['data'])
        if not decrypt_ok:
            raise DecryptError()
        return self._decode_inner(plaintext)

    def decrypt(self, response: bytes):
        call_result = cast(ResultOuter, cbor2.loads(response))
        if not isinstance(call_result, dict):
            raise EnvelopeError('callResult', type(call_result))
        if call_result.get('failure', None) is not None:
            raise CallFailure(call_result['failure'])
        ok = call_result.get('ok', None)
        if not isinstance(ok, dict):
            raise EnvelopeError('callResult.ok', type(ok))
        if ok is not None:
            return self._decrypt_inner(ok)
        raise EnvelopeError("No 'ok in call result!")
