// SPDX-License-Identifier: Apache-2.0

import { randomBytes } from 'crypto';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { SigningTests__factory } from '../typechain-types/factories/contracts/tests';
import { SigningTests } from '../typechain-types/contracts/tests/SigningTests';

async function testSignThenVerify(
  se: SigningTests,
  alg: number,
  keypair: { publicKey: string; secretKey: string },
  ctx: Buffer,
  msg: Buffer,
  ctx_len?: number,
  msg_len?: number,
) {
  const sig = await se.testSign(alg, keypair.secretKey, ctx, msg);

  expect(await se.testVerify(alg, keypair.publicKey, ctx, msg, sig)).equal(
    true,
  );

  // If message is changed, signature will not be valid
  if (msg.length != 0) {
    expect(
      await se.testVerify(
        alg,
        keypair.publicKey,
        ctx,
        randomBytes(msg.length),
        sig,
      ),
    ).equal(false);
  }

  // If context is changed, signature will not be valid
  if (ctx.length != 0) {
    expect(
      await se.testVerify(
        alg,
        keypair.publicKey,
        randomBytes(ctx.length),
        msg,
        sig,
      ),
    ).equal(false);
  }

  if (ctx_len !== undefined) {
    if (ctx_len > 1) {
      expect(
        se.testVerify(
          alg,
          keypair.publicKey,
          randomBytes(ctx_len - 1),
          msg,
          sig,
        ),
      ).to.be.reverted;
    }
    expect(
      se.testVerify(alg, keypair.publicKey, randomBytes(ctx_len + 1), msg, sig),
    ).to.be.reverted;
  }

  if (msg_len !== undefined) {
    if (msg_len > 1) {
      expect(
        se.testVerify(
          alg,
          keypair.publicKey,
          ctx,
          randomBytes(msg_len - 1),
          sig,
        ),
      ).to.be.reverted;
    }
    expect(
      se.testVerify(alg, keypair.publicKey, ctx, randomBytes(msg_len + 1), sig),
    ).to.be.reverted;
  }
}

const EMPTY_BUFFER = Buffer.from([]);

const VARYING_SIZED_BUFFERS = [
  EMPTY_BUFFER,
  randomBytes(1),
  randomBytes(16),
  randomBytes(32),
  randomBytes(48),
  randomBytes(64),
];

describe('Signing', function () {
  let se: SigningTests;

  before(async () => {
    const factory = (await ethers.getContractFactory(
      'SigningTests',
    )) as SigningTests__factory;
    se = await factory.deploy();
  });

  it('Ethereum ecrecover Compatibility', async function () {
    for (let i = 0; i < 20; i++) {
      const seed = randomBytes(32);
      const digest = randomBytes(32);
      const expected_addr = ethers.computeAddress(`0x` + seed.toString('hex'));

      const resp = await se.testEthereum(seed, digest);
      expect(expected_addr).equal(resp.addr);

      const addr_v = ethers.recoverAddress(digest, {
        r: resp.rsv.r,
        s: resp.rsv.s,
        v: Number(resp.rsv.v),
      });
      expect(addr_v).to.equal(expected_addr);
    }
  });

  it('Ed25519 (Oasis)', async () => {
    // Try Ed25519 Oasis (alg=0)
    // Varying sized message and context
    const edo_kp = await se.testKeygen(1, randomBytes(32));
    for (const edo_ctx of VARYING_SIZED_BUFFERS) {
      for (const edo_msg of VARYING_SIZED_BUFFERS) {
        await testSignThenVerify(se, 0, edo_kp, edo_ctx, edo_msg);
      }
    }
  });

  it('Ed25519 (Pure)', async () => {
    // Try Ed25519 Pure (alg=1)
    // Variying sized message, no context
    const ed_kp = await se.testKeygen(1, randomBytes(32));
    for (const ed_msg of VARYING_SIZED_BUFFERS) {
      await testSignThenVerify(se, 1, ed_kp, EMPTY_BUFFER, ed_msg, 0);
    }
  });

  it('Ed25519 (Prehashed SHA-512)', async () => {
    // Try Ed25519 Prehashed SHA-512 (alg=2)
    const edp512_kp = await se.testKeygen(2, randomBytes(32));
    await testSignThenVerify(
      se,
      2,
      edp512_kp,
      randomBytes(64),
      EMPTY_BUFFER,
      64,
      0,
    );
  });

  it('Secp256k1 (Oasis)', async () => {
    // Try Secp256k1 Oasis (alg=3)
    // Note: https://github.com/oasisprotocol/oasis-sdk/blob/ca630e7d48986bd102d7aa477a48f8966a3d1d23/runtime-sdk/src/crypto/signature/secp256k1.rs#L51
    // Uses SHA512-256 to digest the context then the message, so no pre-hashing (full message must be available, unless it's explicitly pre-hashed)
    const k1oasis_kp = await se.testKeygen(3, randomBytes(32));
    for (const k1oasis_ctx of VARYING_SIZED_BUFFERS) {
      for (const k1oasis_msg of VARYING_SIZED_BUFFERS) {
        await testSignThenVerify(se, 3, k1oasis_kp, k1oasis_ctx, k1oasis_msg);
      }
    }
  });

  it('Secp256k1 (Prehashed Keccak256', async () => {
    // Try Secp256k1 prehashed Keccak256 (alg=4)
    // 32 byte context, empty message
    const k256_kp = await se.testKeygen(4, randomBytes(32));
    await testSignThenVerify(
      se,
      4,
      k256_kp,
      randomBytes(32),
      EMPTY_BUFFER,
      32,
      0,
    );
  });

  it('Secp256k1 (Prehashed SHA256)', async () => {
    // Try Secp256k1 prehashed SHA256 (alg=5)
    // 32 byte context, empty message
    const sha256_kp = await se.testKeygen(5, randomBytes(32));
    await testSignThenVerify(
      se,
      5,
      sha256_kp,
      randomBytes(32),
      EMPTY_BUFFER,
      32,
      0,
    );
  });

  // TODO: implement Sr25519

  it('Secp256r1 (Prehashed SHA256)', async () => {
    // Try Secp256r1 (alg=7)
    // 32 byte context, empty message
    const sha256_kp = await se.testKeygen(7, randomBytes(32));
    await testSignThenVerify(
      se,
      7,
      sha256_kp,
      randomBytes(32),
      EMPTY_BUFFER,
      32,
      0,
    );
  });

  it('Secp384r1 (Prehashed SHA384)', async () => {
    // Try Secp384r1 (alg=8)
    // 48 byte context, empty message
    const sha384_kp = await se.testKeygen(8, randomBytes(48));
    await testSignThenVerify(
      se,
      8,
      sha384_kp,
      randomBytes(48),
      EMPTY_BUFFER,
      48,
      0,
    );
  });
});
