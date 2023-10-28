import os
import json
import unittest
from base64 import b64decode
from dataclasses import dataclass

from sapphirepy.deoxysii import DeoxysII, TAG_SIZE

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
            pt_len = int(row['Length'])
            m, a = msg[:pt_len], ad[:pt_len]

            expected_dst = bytearray()
            expected_dst += b64decode(row['Ciphertext'])
            expected_dst += b64decode(row['Tag'])
            expected_ciphertext = expected_dst[off:]

            dst = bytearray(pt_len + TAG_SIZE)
            x.E(nonce, dst, a, m)
            c = dst[off:]
            self.assertEqual(c[:pt_len], expected_ciphertext[:pt_len])

            p = bytearray(pt_len)
            self.assertTrue(x.D(nonce, p, a, c))

            # Test malformed ciphertext (or tag).
            bad_ciphertext = c[:]
            bad_ciphertext[pt_len] ^= 0x23
            p = bytearray(pt_len)
            self.assertFalse(x.D(nonce, p, a, bad_ciphertext))

            # Test malformed AD.
            if pt_len > 0:
                bad_ad = bytearray(a[:])
                bad_ad[pt_len-1] ^= 0x23
                p = bytearray(pt_len)
                self.assertFalse(x.D(nonce, p, bad_ad, c))

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
