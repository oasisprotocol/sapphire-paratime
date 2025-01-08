import {
  MuNaclError,
  crypto_scalarmult_SCALARBYTES,
  crypto_box_PUBLICKEYBYTES,
  hexlify,
  naclScalarMult,
  naclScalarMultBase,
  boxKeyPairFromSecretKey,
  crypto_box_SECRETKEYBYTES,
  ed25519_verify_raw_cofactorless,
  getBytes,
  ed25519_is_valid_scalar,
  ed25519_verify_raw_cofactored,
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

  it('is_in_scalar_field', () => {
    // L - 2^0
    expect(
      ed25519_is_valid_scalar(
        new Uint8Array([
          0xec, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd6, 0x9c, 0xf7,
          0xa2, 0xde, 0xf9, 0xde, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10,
        ]),
      ),
    ).toStrictEqual(true);

    // L - 2^64
    expect(
      ed25519_is_valid_scalar(
        new Uint8Array([
          0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd5, 0x9c, 0xf7,
          0xa2, 0xde, 0xf9, 0xde, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10,
        ]),
      ),
    ).toStrictEqual(true);

    // L - 2^192
    expect(
      ed25519_is_valid_scalar(
        new Uint8Array([
          0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd5, 0x9c, 0xf7,
          0xa2, 0xde, 0xf9, 0xde, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x0f,
        ]),
      ),
    ).toStrictEqual(true);

    // L
    expect(
      ed25519_is_valid_scalar(
        new Uint8Array([
          0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd6, 0x9c, 0xf7,
          0xa2, 0xde, 0xf9, 0xde, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10,
        ]),
      ),
    ).toStrictEqual(false);

    // L + 2^0
    expect(
      ed25519_is_valid_scalar(
        new Uint8Array([
          0xef, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd6, 0x9c, 0xf7,
          0xa2, 0xde, 0xf9, 0xde, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10,
        ]),
      ),
    ).toStrictEqual(false);

    // L + 2^64
    expect(
      ed25519_is_valid_scalar(
        new Uint8Array([
          0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd7, 0x9c, 0xf7,
          0xa2, 0xde, 0xf9, 0xde, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10,
        ]),
      ),
    ).toStrictEqual(false);

    // L + 2^128
    expect(
      ed25519_is_valid_scalar(
        new Uint8Array([
          0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd6, 0x9c, 0xf7,
          0xa2, 0xde, 0xf9, 0xde, 0x14, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10,
        ]),
      ),
    ).toStrictEqual(false);

    // L + 2^192
    expect(
      ed25519_is_valid_scalar(
        new Uint8Array([
          0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd6, 0x9c, 0xf7,
          0xa2, 0xde, 0xf9, 0xde, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10,
        ]),
      ),
    ).toStrictEqual(false);

    // Scalar from the go runtime's test case.
    expect(
      ed25519_is_valid_scalar(
        new Uint8Array([
          0x67, 0x65, 0x4b, 0xce, 0x38, 0x32, 0xc2, 0xd7, 0x6f, 0x8f, 0x6f,
          0x5d, 0xaf, 0xc0, 0x8d, 0x93, 0x39, 0xd4, 0xee, 0xf6, 0x76, 0x57,
          0x33, 0x36, 0xa5, 0xc5, 0x1e, 0xb6, 0xf9, 0x46, 0xb3, 0x1d,
        ]),
      ),
    ).toStrictEqual(false);
  });

  describe('ed25519', () => {
    it('Test Cases', () => {
      const cases = [
        {
          message: '0x',
          pub_key:
            '0xd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
          signature:
            '0xe5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
        },

        {
          message: '0x72',
          pub_key:
            '0x3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
          signature:
            '0x92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00',
        },

        {
          message: '0xaf82',
          pub_key:
            '0xfc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025',
          signature:
            '0x6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a',
        },
      ];

      for (const c of cases) {
        const sig = getBytes(c.signature);
        const pbk = getBytes(c.pub_key);
        const msg = getBytes(c.message);
        const x = ed25519_verify_raw_cofactorless(sig, pbk, msg);
        const z = ed25519_verify_raw_cofactored(sig, pbk, msg);
        /*
        const outMsg = new Uint8Array(msg.length + 64);
        const y = crypto_sign_open(
          outMsg,
          new Uint8Array([...sig, ...msg]),
          msg.length + 64,
          pbk,
        );
        expect(y).toStrictEqual(msg.length);
        */
        expect(x).toStrictEqual(true);
        expect(z).toStrictEqual(true);
      }
    });

    it('speccheck', () => {
      const cases = [
        { // #0: canonical S, small R, small A
          message:
            '8c93255d71dcab10e8f379c26200f3c7bd5f09d9bc3068d3ef4edeb4853022b6',
          pub_key:
            'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa',
          signature:
            'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a0000000000000000000000000000000000000000000000000000000000000000',
          expected_with_cofactored: false,
          expected_with_cofactorless: false,
        },
        {  // #1: canonical S, mixed R, small A
          message:
            '9bd9f44f4dcc75bd531b56b2cd280b0bb38fc1cd6d1230e14861d861de092e79',
          pub_key:
            'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa',
          signature:
            'f7badec5b8abeaf699583992219b7b223f1df3fbbea919844e3f7c554a43dd43a5bb704786be79fc476f91d3f3f89b03984d8068dcf1bb7dfc6637b45450ac04',
          expected_with_cofactored: false,
          expected_with_cofactorless: false,
        },
        { // #2: canonical S, small R, mixed A
          message:
            'aebf3f2601a0c8c5d39cc7d8911642f740b78168218da8471772b35f9d35b9ab',
          pub_key:
            'f7badec5b8abeaf699583992219b7b223f1df3fbbea919844e3f7c554a43dd43',
          signature:
            'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa8c4bd45aecaca5b24fb97bc10ac27ac8751a7dfe1baff8b953ec9f5833ca260e',
          expected_with_cofactored: false,
          expected_with_cofactorless: false,
        },
        { // #3-4: canonical S, mixed R, mixed A
          message:
            '9bd9f44f4dcc75bd531b56b2cd280b0bb38fc1cd6d1230e14861d861de092e79',
          pub_key:
            'cdb267ce40c5cd45306fa5d2f29731459387dbf9eb933b7bd5aed9a765b88d4d',
          signature:
            '9046a64750444938de19f227bb80485e92b83fdb4b6506c160484c016cc1852f87909e14428a7a1d62e9f22f3d3ad7802db02eb2e688b6c52fcd6648a98bd009',
          expected_with_cofactored: true,
          expected_with_cofactorless: true,
        },
        { // 4
          message:
            'e47d62c63f830dc7a6851a0b1f33ae4bb2f507fb6cffec4011eaccd55b53f56c',
          pub_key:
            'cdb267ce40c5cd45306fa5d2f29731459387dbf9eb933b7bd5aed9a765b88d4d',
          signature:
            '160a1cb0dc9c0258cd0a7d23e94d8fa878bcb1925f2c64246b2dee1796bed5125ec6bc982a269b723e0668e540911a9a6a58921d6925e434ab10aa7940551a09',
          expected_with_cofactored: true,
          expected_with_cofactorless: false,
        },
        { // #5 Prereduce scalar which fails cofactorless
          message:
            'e47d62c63f830dc7a6851a0b1f33ae4bb2f507fb6cffec4011eaccd55b53f56c',
          pub_key:
            'cdb267ce40c5cd45306fa5d2f29731459387dbf9eb933b7bd5aed9a765b88d4d',
          signature:
            '21122a84e0b5fca4052f5b1235c80a537878b38f3142356b2c2384ebad4668b7e40bc836dac0f71076f9abe3a53f9c03c1ceeeddb658d0030494ace586687405',
          expected_with_cofactored: true,
          expected_with_cofactorless: false,
        },
        { // #6 Large S
          message:
            '85e241a07d148b41e47d62c63f830dc7a6851a0b1f33ae4bb2f507fb6cffec40',
          pub_key:
            '442aad9f089ad9e14647b1ef9099a1ff4798d78589e66f28eca69c11f582a623',
          signature:
            'e96f66be976d82e60150baecff9906684aebb1ef181f67a7189ac78ea23b6c0e547f7690a0e2ddcd04d87dbc3490dc19b3b3052f7ff0538cb68afb369ba3a514',
          expected_with_cofactored: false,
          expected_with_cofactorless: false,
        },
        { // #7 Large S beyond the high bit checks (i.e. non-canonical representation)
          message:
            '85e241a07d148b41e47d62c63f830dc7a6851a0b1f33ae4bb2f507fb6cffec40',
          pub_key:
            '442aad9f089ad9e14647b1ef9099a1ff4798d78589e66f28eca69c11f582a623',
          signature:
            '8ce5b96c8f26d0ab6c47958c9e68b937104cd36e13c33566acd2fe8d38aa19427e71f98a473474f2f13f06f97c20d58cc3f54b8bd0d272f42b695dd7e89a8c22',
          expected_with_cofactored: false,
          expected_with_cofactorless: false,
        },
        { // #8-9 Non canonical R
          message:
            '9bedc267423725d473888631ebf45988bad3db83851ee85c85e241a07d148b41',
          pub_key:
            'f7badec5b8abeaf699583992219b7b223f1df3fbbea919844e3f7c554a43dd43',
          signature:
            'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff03be9678ac102edcd92b0210bb34d7428d12ffc5df5f37e359941266a4e35f0f',
          expected_with_cofactored: true,
          expected_with_cofactorless: false,
        },
        { // 9
          message:
            '9bedc267423725d473888631ebf45988bad3db83851ee85c85e241a07d148b41',
          pub_key:
            'f7badec5b8abeaf699583992219b7b223f1df3fbbea919844e3f7c554a43dd43',
          signature:
            'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffca8c5b64cd208982aa38d4936621a4775aa233aa0505711d8fdcfdaa943d4908',
          expected_with_cofactored: true,
          expected_with_cofactorless: false,
        },
        { // #10-11 Non canonical A
          message:
            'e96b7021eb39c1a163b6da4e3093dcd3f21387da4cc4572be588fafae23c155b',
          pub_key:
            'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          signature:
            'a9d55260f765261eb9b84e106f665e00b867287a761990d7135963ee0a7d59dca5bb704786be79fc476f91d3f3f89b03984d8068dcf1bb7dfc6637b45450ac04',
          expected_with_cofactored: true,
          expected_with_cofactorless: false,
        },

        { // 11
          message:
            '39a591f5321bbe07fd5a23dc2f39d025d74526615746727ceefd6e82ae65c06f',
          pub_key:
            'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          signature:
            'a9d55260f765261eb9b84e106f665e00b867287a761990d7135963ee0a7d59dca5bb704786be79fc476f91d3f3f89b03984d8068dcf1bb7dfc6637b45450ac04',
          expected_with_cofactored: true,
          expected_with_cofactorless: true,
        },
      ] as const;

      let i = 0;
      for (const c of cases) {
        const sig = getBytes(`0x${c.signature}`);
        const pbk = getBytes(`0x${c.pub_key}`);
        const msg = getBytes(`0x${c.message}`);
        const cofactorless = ed25519_verify_raw_cofactorless(sig, pbk, msg);
        const cofactored = ed25519_verify_raw_cofactored(sig, pbk, msg);
        expect(cofactorless).toStrictEqual(c.expected_with_cofactorless);
        expect(cofactored).toStrictEqual(c.expected_with_cofactored);
        i += 1;
      }
    });

    it('Case 1 - small order A', () => {
      const pbk = getBytes(
        '0xc7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa',
      );
      const msg = getBytes(
        '0x9bd9f44f4dcc75bd531b56b2cd280b0bb38fc1cd6d1230e14861d861de092e79',
      );
      const sig = getBytes(
        '0xf7badec5b8abeaf699583992219b7b223f1df3fbbea919844e3f7c554a43dd43a5bb704786be79fc476f91d3f3f89b03984d8068dcf1bb7dfc6637b45450ac04',
      );
      // small order A not rejected
      expect(ed25519_verify_raw_cofactored(sig, pbk, msg)).toStrictEqual(false);
      expect(ed25519_verify_raw_cofactorless(sig, pbk, msg)).toStrictEqual(false);
    });

    it('Case 2 - reject small order R', () => {
      const pbk = getBytes(
        '0xf7badec5b8abeaf699583992219b7b223f1df3fbbea919844e3f7c554a43dd43',
      );
      const msg = getBytes(
        '0xaebf3f2601a0c8c5d39cc7d8911642f740b78168218da8471772b35f9d35b9ab',
      );
      const sig = getBytes(
        '0xc7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa8c4bd45aecaca5b24fb97bc10ac27ac8751a7dfe1baff8b953ec9f5833ca260e',
      );
      // small order R not rejected
      expect(ed25519_verify_raw_cofactored(sig, pbk, msg)).toStrictEqual(false);
      expect(ed25519_verify_raw_cofactorless(sig, pbk, msg)).toStrictEqual(false);
    });

    // Vector 4 is made to pass cofactored and fail in cofactorless verification, this vector
    // is the main indicator of what type of verification is used in the implementation
    //
    // RFC 8032 [18] allows optionality between using a permissive verification
    // equation (cofactored) and a more strict verification equation (cofactorless)
    it('Case 4 - cofactored verification', () => {
      const pbk = getBytes(
        '0xcdb267ce40c5cd45306fa5d2f29731459387dbf9eb933b7bd5aed9a765b88d4d',
      );
      const msg = getBytes(
        '0xe47d62c63f830dc7a6851a0b1f33ae4bb2f507fb6cffec4011eaccd55b53f56c',
      );
      const sig = getBytes(
        '0x160a1cb0dc9c0258cd0a7d23e94d8fa878bcb1925f2c64246b2dee1796bed5125ec6bc982a269b723e0668e540911a9a6a58921d6925e434ab10aa7940551a09',
      );
      expect(ed25519_verify_raw_cofactorless(sig, pbk, msg)).toStrictEqual(false);
      expect(ed25519_verify_raw_cofactored(sig, pbk, msg)).toStrictEqual(true);
    });
  });
});
