// SPDX-License-Identifier: CC-PDDC

import { randomBytes } from 'crypto';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Precompiles', function () {
  async function deploy() {
    const SigningTests_Contract = await ethers.getContractFactory(
      'SigningTests',
    );
    const se = await SigningTests_Contract.deploy();

    return { se };
  }

  it('Sign & Verify', async function () {
    const { se } = await deploy();

    const empty_bytes = new Uint8Array([]);

    // Try Ed25519 Oasis (alg=0)
    const edo_seed = randomBytes(32);
    const edo_kp = await se.testKeygen(1, edo_seed);
    for (const edo_ctx of [
      empty_bytes,
      randomBytes(1),
      randomBytes(16),
      randomBytes(32),
      randomBytes(64),
    ]) {
      for (const edo_msg of [
        empty_bytes,
        randomBytes(1),
        randomBytes(16),
        randomBytes(32),
        randomBytes(64),
      ]) {
        const edo_sig = await se.testSign(
          1,
          edo_kp.secretKey,
          edo_ctx,
          edo_msg,
        );
        const edo_vfy = await se.testVerify(
          1,
          edo_kp.publicKey,
          edo_ctx,
          edo_msg,
          edo_sig,
        );
        expect(edo_vfy).equal(true);
      }
    }

    // Try Ed25519 Pure (alg=1)
    const ed_seed = randomBytes(32);
    const ed_kp = await se.testKeygen(1, ed_seed);
    for (const ed_msg of [
      empty_bytes,
      randomBytes(1),
      randomBytes(16),
      randomBytes(32),
      randomBytes(64),
    ]) {
      const ed_sig = await se.testSign(
        1,
        ed_kp.secretKey,
        empty_bytes,
        ed_msg,
      );
      const ed_vfy = await se.testVerify(
        1,
        ed_kp.publicKey,
        empty_bytes,
        ed_msg,
        ed_sig,
      );
      expect(ed_vfy).equal(true);
    }

    // Try Ed25519 Prehashed SHA-512 (alg=2)
    const edp512_seed = randomBytes(32);
    const edp512_kp = await se.testKeygen(2, edp512_seed);
    const edp512_ctx = randomBytes(64);
    const edp512_sig = await se.testSign(
      2,
      edp512_kp.secretKey,
      edp512_ctx,
      empty_bytes,
    );
    const edp512_vfy = await se.testVerify(
      2,
      edp512_kp.publicKey,
      edp512_ctx,
      empty_bytes,
      edp512_sig,
    );
    expect(edp512_vfy).equal(true);

    // Try Secp256k1 Oasis (alg=3)
    // Note: https://github.com/oasisprotocol/oasis-sdk/blob/ca630e7d48986bd102d7aa477a48f8966a3d1d23/runtime-sdk/src/crypto/signature/secp256k1.rs#L51
    // Uses SHA512-256 to digest the context then the message, so no pre-hashing (full message must be available, unless it's explicitly pre-hashed)
    const k1oasis_seed = randomBytes(32);
    const k1oasis_kp = await se.testKeygen(3, k1oasis_seed);
    for (const k1oasis_ctx of [
      empty_bytes,
      randomBytes(1),
      randomBytes(16),
      randomBytes(32),
      randomBytes(64),
    ]) {
      for (const k1oasis_msg of [
        empty_bytes,
        randomBytes(1),
        randomBytes(16),
        randomBytes(32),
        randomBytes(64),
      ]) {
        const k1oasis_sig = await se.testSign(
          3,
          k1oasis_kp.secretKey,
          k1oasis_ctx,
          k1oasis_msg,
        );
        const k1oasis_vfy = await se.testVerify(
          3,
          k1oasis_kp.publicKey,
          k1oasis_ctx,
          k1oasis_msg,
          k1oasis_sig,
        );
        expect(k1oasis_vfy).equal(true);
      }
    }

    // Try Secp256k1 prehashed Keccak256 (alg=4)
    // TODO: verify it fails with non-empty message
    // TODO: verify it fails when context != 32 bytes
    // TODO: verify changing any bit of any parameter invalidates
    const k256_seed = randomBytes(32);
    const k256_kp = await se.testKeygen(4, k256_seed);
    const k256_ctx = randomBytes(32);
    const k256_sig = await se.testSign(
      4,
      k256_kp.secretKey,
      k256_ctx,
      empty_bytes,
    );
    const k256_vfy = await se.testVerify(
      4,
      k256_kp.publicKey,
      k256_ctx,
      empty_bytes,
      k256_sig,
    );
    expect(k256_vfy).equal(true);

    // Try Secp256k1 prehashed SHA256 (alg=5)
    // TODO: verify it fails with non-empty message
    // TODO: verify it fails when context != 32 bytes
    // TODO: verify changing any bit of any parameter invalidates
    const sha256_seed = randomBytes(32);
    const sha256_kp = await se.testKeygen(5, sha256_seed);
    const sha256_ctx = randomBytes(32);
    const sha256_sig = await se.testSign(
      5,
      sha256_kp.secretKey,
      sha256_ctx,
      empty_bytes,
    );
    const sha256_vfy = await se.testVerify(
      5,
      sha256_kp.publicKey,
      sha256_ctx,
      empty_bytes,
      sha256_sig,
    );
    expect(sha256_vfy).equal(true);
  });
});
