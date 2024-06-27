import {
  MuNaclError,
  crypto_scalarmult_SCALARBYTES,
  crypto_box_PUBLICKEYBYTES,
  hexlify,
  naclScalarMult,
  naclScalarMultBase,
  boxKeyPairFromSecretKey,
  crypto_box_SECRETKEYBYTES,
} from '@oasisprotocol/sapphire-paratime';

describe('munacl', () => {
  it('scalarMultBase', () => {
    // This takes takes a bit of time.
    // Similar to https://code.google.com/p/go/source/browse/curve25519/curve25519_test.go?repo=crypto
    const golden = new Uint8Array([
      0x89, 0x16, 0x1f, 0xde, 0x88, 0x7b, 0x2b, 0x53, 0xde, 0x54, 0x9a, 0xf4,
      0x83, 0x94, 0x01, 0x06, 0xec, 0xc1, 0x14, 0xd6, 0x98, 0x2d, 0xaa, 0x98,
      0x25, 0x6d, 0xe2, 0x3b, 0xdf, 0x77, 0x66, 0x1a,
    ]);
    let input = new Uint8Array([
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0,
    ]);
    for (let i = 0; i < 200; i++) {
      input = naclScalarMultBase(input);
    }
    expect(hexlify(input)).toEqual(hexlify(golden));
  });

  it('errors', () => {
    expect(() =>
      naclScalarMultBase(new Uint8Array(crypto_scalarmult_SCALARBYTES)),
    ).not.toThrow(MuNaclError);
    expect(() =>
      naclScalarMultBase(new Uint8Array(crypto_scalarmult_SCALARBYTES - 1)),
    ).toThrow(MuNaclError);

    expect(() =>
      naclScalarMult(
        new Uint8Array(crypto_scalarmult_SCALARBYTES),
        new Uint8Array(crypto_box_PUBLICKEYBYTES),
      ),
    ).not.toThrow(MuNaclError);
    expect(() =>
      naclScalarMult(
        new Uint8Array(crypto_scalarmult_SCALARBYTES),
        new Uint8Array(crypto_box_PUBLICKEYBYTES - 1),
      ),
    ).toThrow(MuNaclError);

    expect(() =>
      boxKeyPairFromSecretKey(new Uint8Array(crypto_box_SECRETKEYBYTES)),
    ).not.toThrow(MuNaclError);
    expect(() =>
      boxKeyPairFromSecretKey(new Uint8Array(crypto_box_SECRETKEYBYTES - 1)),
    ).toThrow(MuNaclError);
  });
});
