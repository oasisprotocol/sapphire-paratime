import os
import sys
from base64 import b64decode
from dataclasses import dataclass
import json

TESTDATA = os.path.join(os.path.dirname(__file__), 'testdata')

from deoxysii import VartimeInstance, TagSize

def katTests():
    fn = os.path.join(TESTDATA, 'Deoxys-II-256-128.json')
    with open(fn, 'r') as handle:
        data = json.load(handle)
    key = b64decode(data['Key'])
    nonce = b64decode(data['Nonce'])
    assert len(nonce) == 15
    msg = b64decode(data['MsgData'])
    ad = b64decode(data['AADData'])
    x = VartimeInstance(key)

    off = 0

    for row in data['KnownAnswers']:
        ptLen = int(row['Length'])
        m, a = msg[:ptLen], ad[:ptLen]

        expectedDst = bytearray()
        expectedDst += b64decode(row['Ciphertext'])
        expectedDst += b64decode(row['Tag'])
        expectedC = expectedDst[off:]

        dst = bytearray(ptLen + TagSize)
        x.E(nonce, dst, a, m)
        c = dst[off:]
        assert c[:ptLen] == expectedC[:ptLen]

        p = bytearray(ptLen)
        assert x.D(nonce, p, a, c)

        # Test malformed ciphertext (or tag).
        badC = c[:]
        badC[ptLen] ^= 0x23
        p = bytearray(ptLen)
        assert False == x.D(nonce, p, a, badC)

        # Test malformed AD.
        if ptLen > 0:
            badA = bytearray(a[:])
            badA[ptLen-1] ^= 0x23
            p = bytearray(ptLen)
            assert False == x.D(nonce, p, badA, c)


@dataclass
class OfficialTestVector:
    name: str
    key: bytes
    nonce: bytes
    ad: bytes|None
    msg: bytes
    sealed: bytes

def officialTests():
    fn = os.path.join(TESTDATA, 'Deoxys-II-256-128-official-20190608.json')
    with open(fn, 'r') as handle:
        data = json.load(handle)
        for row in data:
            t = OfficialTestVector(
                row['Name'],
                bytes.fromhex(row['Key']),
                bytes.fromhex(row['Nonce']),
                bytes.fromhex(row['AssociatedData']) if row['AssociatedData'] else b"",
                bytes.fromhex(row['Message']) if row['Message'] else b"",
                bytes.fromhex(row['Sealed'])
            )
            #print(t.name)
            #print('\t   Key:', t.key.hex())
            #print('\t Nonce:', t.nonce.hex())
            #print('\t    AD:', t.ad.hex())
            #print('\t   Msg:', t.msg.hex())
            #print('\tSealed:', t.sealed.hex())

            x = VartimeInstance(t.key)

            # Verify encryption matches
            ciphertext = bytearray(len(t.sealed))
            x.E(t.nonce, ciphertext, t.ad, t.msg)
            #print('\t   Enc:', ciphertext == t.sealed)
            assert ciphertext == t.sealed

            # Verify decryption matches
            plaintext = bytearray(len(t.msg) if t.msg else 0)
            result = x.D(t.nonce, plaintext, t.ad, t.sealed)
            #print('\t   Dec:', result, plaintext == t.msg)
            #print('\t    PT:', plaintext.hex())
            assert result
            assert plaintext == t.msg
            #print()
    return 0

def main(bn, *args):
    officialTests()
    katTests()
    return 0

if __name__ == "__main__":
    sys.exit(main(*sys.argv))
