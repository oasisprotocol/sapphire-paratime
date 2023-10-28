import os
import sys
import json
import unittest
from base64 import b64decode
from dataclasses import dataclass

from sapphirepy.deoxysii import DeoxysII, TagSize

TESTDATA = os.path.join(os.path.dirname(__file__), 'testdata')

@dataclass
class OfficialTestVector:
    name: str
    key: bytes
    nonce: bytes
    ad: bytes|None
    msg: bytes
    sealed: bytes

class TestDeoxysII(unittest.TestCase):
    def test_kat(self):
        fn = os.path.join(TESTDATA, 'Deoxys-II-256-128.json')
        with open(fn, 'r') as handle:
            data = json.load(handle)
        key = b64decode(data['Key'])
        nonce = b64decode(data['Nonce'])
        assert len(nonce) == 15
        msg = b64decode(data['MsgData'])
        ad = b64decode(data['AADData'])
        x = DeoxysII(key)

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
            self.assertEqual(c[:ptLen], expectedC[:ptLen])

            p = bytearray(ptLen)
            self.assertTrue(x.D(nonce, p, a, c))

            # Test malformed ciphertext (or tag).
            badC = c[:]
            badC[ptLen] ^= 0x23
            p = bytearray(ptLen)
            self.assertFalse(x.D(nonce, p, a, badC))

            # Test malformed AD.
            if ptLen > 0:
                badA = bytearray(a[:])
                badA[ptLen-1] ^= 0x23
                p = bytearray(ptLen)
                self.assertFalse(x.D(nonce, p, badA, c))

    def test_official(self):
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

                x = DeoxysII(t.key)

                # Verify encryption matches
                ciphertext = bytearray(len(t.sealed))
                x.E(t.nonce, ciphertext, t.ad, t.msg)
                #print('\t   Enc:', ciphertext == t.sealed)
                self.assertEqual(ciphertext, t.sealed)

                # Verify decryption matches
                plaintext = bytearray(len(t.msg) if t.msg else 0)
                result = x.D(t.nonce, plaintext, t.ad, t.sealed)
                #print('\t   Dec:', result, plaintext == t.msg)
                #print('\t    PT:', plaintext.hex())
                self.assertTrue(result)
                self.assertEqual(plaintext, t.msg)
                #print()

if __name__ == '__main__':
    unittest.main()
