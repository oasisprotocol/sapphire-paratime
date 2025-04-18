// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/**
 * @title Sapphire
 * @notice This library provides a number of convenient wrappers for
 * cryptographic operations such as the x25519 key derivation, Deoxys-II-based
 * encryption and decryption, signing key generation, message digest signing and
 * verification, gas padding and hashing.
 *
 * Most of the mentioned functions are implemented as Sapphire's precompiles and
 * are cheap to call.
 *
 * #### Calling Precompiles Manually
 *
 * You can override the wrappers and call Sapphire precompiles by dispatching
 * calls to specific well-known contract addresses, as described below. The
 * __Precompile address__ section of each function will show you the address
 * of the corresponding precompile.
 *
 * Input parameters should be packed into a contiguous memory region with each
 * chunk of data padded to 32 bytes as usual. The recommended way to construct
 * parameter byte sequences in Solidity is with `abi.encode` and `abi.decode`,
 * which will transparently handle things like putting `bytes` lengths in the
 * correct position.
 */
library Sapphire {
    // Oasis-specific, confidential precompiles
    address internal constant RANDOM_BYTES =
        0x0100000000000000000000000000000000000001;
    address internal constant DERIVE_KEY =
        0x0100000000000000000000000000000000000002;
    address internal constant ENCRYPT =
        0x0100000000000000000000000000000000000003;
    address internal constant DECRYPT =
        0x0100000000000000000000000000000000000004;
    address internal constant GENERATE_SIGNING_KEYPAIR =
        0x0100000000000000000000000000000000000005;
    address internal constant SIGN_DIGEST =
        0x0100000000000000000000000000000000000006;
    address internal constant VERIFY_DIGEST =
        0x0100000000000000000000000000000000000007;
    address internal constant CURVE25519_PUBLIC_KEY =
        0x0100000000000000000000000000000000000008;
    address internal constant GAS_USED =
        0x0100000000000000000000000000000000000009;
    address internal constant PAD_GAS =
        0x010000000000000000000000000000000000000a;

    // Oasis-specific, general precompiles
    address internal constant SHA512_256 =
        0x0100000000000000000000000000000000000101;
    address internal constant SHA512 =
        0x0100000000000000000000000000000000000102;
    address internal constant SHA384 =
        0x0100000000000000000000000000000000000104;

    type Curve25519PublicKey is bytes32;
    type Curve25519SecretKey is bytes32;

    enum SigningAlg {
        /// Ed25519 signature over the provided message using SHA-512/265 with a domain separator.
        /// Can be used to sign transactions for the Oasis consensus layer and SDK paratimes.
        Ed25519Oasis,
        /// Ed25519 signature over the provided message.
        Ed25519Pure,
        /// Ed25519 signature over the provided prehashed SHA-512 digest.
        Ed25519PrehashedSha512,
        /// Secp256k1 signature over the provided message using SHA-512/256 with a domain separator.
        /// Can be used to sign transactions for the Oasis consensus layer and SDK paratimes.
        Secp256k1Oasis,
        /// Secp256k1 over the provided Keccak256 digest.
        /// Can be used to sign transactions for Ethereum-compatible networks.
        Secp256k1PrehashedKeccak256,
        /// Secp256k1 signature over the provided SHA-256 digest.
        Secp256k1PrehashedSha256,
        /// Sr25519 signature over the provided message.
        Sr25519,
        /// Secp256r1 signature over the provided SHA-256 digest.
        Secp256r1PrehashedSha256,
        /// Secp384r1 signature over the provided SHA-384 digest.
        Secp384r1PrehashedSha384
    }

    /**
     * @notice Generate `num_bytes` pseudo-random bytes, with an optional
     * personalization string (`pers`) added into the hashing algorithm to
     * increase domain separation when needed.
     *
     * #### Precompile address
     *
     * `0x0100000000000000000000000000000000000001`
     *
     * #### Gas cost
     *
     * 10,000 minimum plus 240 per output word plus 60 per word of the
     * personalization string.
     *
     * #### Implementation details
     *
     * The mode (e.g. simulation or "view call" vs transaction execution) is fed
     * to TupleHash (among other block-dependent components) to derive the "key
     * id", which is then used to derive a per-block VRF key from
     * epoch-ephemeral entropy (using KMAC256 and cSHAKE) so a different key
     * id will result in a unique per-block VRF key. This per-block VRF key is
     * then used to create the per-block root RNG which is then used to derive
     * domain-separated (using Merlin transcripts) per-transaction random RNGs
     * which are then exposed via this precompile. The KMAC, cSHAKE and
     * TupleHash algorithms are SHA-3 derived functions defined in [NIST
     * Special Publication 800-185](https://nvlpubs.nist.gov/nistpubs/specialpublications/nist.sp.800-185.pdf).
     *
     * #### Example
     *
     * ```solidity
     * bytes memory randomPad = Sapphire.randomBytes(64, "");
     * ```
     *
     * @param numBytes The number of bytes to return.
     * @param pers An optional personalization string to increase domain
     *        separation.
     * @return The random bytes. If the number of bytes requested is too large
     *         (over 1024), a smaller amount (1024) will be returned.
     */
    function randomBytes(uint256 numBytes, bytes memory pers)
        internal
        view
        returns (bytes memory)
    {
        (bool success, bytes memory entropy) = RANDOM_BYTES.staticcall(
            abi.encode(numBytes, pers)
        );
        require(success, "randomBytes: failed");
        return entropy;
    }

    /**
     * @notice Generates a Curve25519 keypair.
     * @param pers An optional personalization string used to add domain
     * separation.
     * @return pk The Curve25519 public key. Useful for key exchange.
     * @return sk The Curve25519 secret key. Pairs well with
     * [deriveSymmetricKey](#derivesymmetrickey).
     */
    function generateCurve25519KeyPair(bytes memory pers)
        internal
        view
        returns (Curve25519PublicKey pk, Curve25519SecretKey sk)
    {
        bytes memory scalar = randomBytes(32, pers);
        // Twiddle some bits, as per RFC 7748 §5.
        scalar[0] &= 0xf8; // Make it a multiple of 8 to avoid small subgroup attacks.
        scalar[31] &= 0x7f; // Clamp to < 2^255 - 19
        scalar[31] |= 0x40; // Clamp to >= 2^254
        (bool success, bytes memory pkBytes) = CURVE25519_PUBLIC_KEY.staticcall(
            scalar
        );
        require(success, "gen curve25519 pk: failed");
        return (
            Curve25519PublicKey.wrap(bytes32(pkBytes)),
            Curve25519SecretKey.wrap(bytes32(scalar))
        );
    }

    /**
     * @notice Derive a symmetric key from a pair of keys using x25519.
     *
     * #### Precompile address
     *
     * `0x0100000000000000000000000000000000000002`
     *
     * #### Gas cost
     *
     * 100,000
     *
     * #### Example
     *
     * ```solidity
     * bytes32 publicKey = ... ;
     * bytes32 privateKey = ... ;
     * bytes32 symmetric = Sapphire.deriveSymmetricKey(publicKey, privateKey);
     * ```
     *
     * @param peerPublicKey The peer's public key.
     * @param secretKey Your secret key.
     * @return A derived symmetric key.
     */
    function deriveSymmetricKey(
        Curve25519PublicKey peerPublicKey,
        Curve25519SecretKey secretKey
    ) internal view returns (bytes32) {
        (bool success, bytes memory symmetric) = DERIVE_KEY.staticcall(
            abi.encode(peerPublicKey, secretKey)
        );
        require(success, "deriveSymmetricKey: failed");
        return bytes32(symmetric);
    }

    /**
     * @notice Encrypt and authenticate the plaintext and additional data using
     * DeoxysII.
     *
     * #### Precompile address
     *
     * `0x0100000000000000000000000000000000000003`
     *
     * #### Gas cost
     *
     * 50,000 minimum plus 100 per word of input
     *
     * #### Example
     *
     * ```solidity
     * bytes32 key = ... ;
     * bytes32 nonce = ... ;
     * bytes memory text = "plain text";
     * bytes memory ad = "additional data";
     * bytes memory encrypted = Sapphire.encrypt(key, nonce, text, ad);
     * bytes memory decrypted = Sapphire.decrypt(key, nonce, encrypted, ad);
     * ```
     *
     * @param key The key to use for encryption.
     * @param nonce The nonce. Note that only the first 15 bytes of this
     * parameter are used.
     * @param plaintext The plaintext to encrypt and authenticate.
     * @param additionalData The additional data to authenticate.
     * @return The ciphertext with appended auth tag.
     */
    function encrypt(
        bytes32 key,
        bytes32 nonce,
        bytes memory plaintext,
        bytes memory additionalData
    ) internal view returns (bytes memory) {
        (bool success, bytes memory ciphertext) = ENCRYPT.staticcall(
            abi.encode(key, nonce, plaintext, additionalData)
        );
        require(success, "encrypt: failed");
        return ciphertext;
    }

    /**
     * @notice Decrypt and authenticate the ciphertext and additional data using
     * DeoxysII. Reverts if the auth tag is incorrect.
     *
     * #### Precompile address
     *
     * `0x0100000000000000000000000000000000000004`
     *
     * #### Gas cost
     *
     * 50,000 minimum plus 100 per word of input
     *
     * #### Example
     *
     * ```solidity
     * bytes32 key = ... ;
     * bytes32 nonce = ... ;
     * bytes memory text = "plain text";
     * bytes memory ad = "additional data";
     * bytes memory encrypted = Sapphire.encrypt(key, nonce, text, ad);
     * bytes memory decrypted = Sapphire.decrypt(key, nonce, encrypted, ad);
     * ```
     *
     * @param key The key to use for decryption.
     * @param nonce The nonce. Note that only the first 15 bytes of this
     * parameter are used.
     * @param ciphertext The ciphertext with tag to decrypt and authenticate.
     * @param additionalData The additional data to authenticate against the
     * ciphertext.
     * @return The original plaintext.
     */
    function decrypt(
        bytes32 key,
        bytes32 nonce,
        bytes memory ciphertext,
        bytes memory additionalData
    ) internal view returns (bytes memory) {
        (bool success, bytes memory plaintext) = DECRYPT.staticcall(
            abi.encode(key, nonce, ciphertext, additionalData)
        );
        require(success, "decrypt: failed");
        return plaintext;
    }

    /**
     * @notice Generate a public/private key pair using the specified method and
     * seed. The available methods are items in the
     * [`Sapphire.SigningAlg`](#signingalg) enum. Note, however, that the
     * generation method ignores subvariants, so all three Ed25519-based are
     * equivalent, and all Secp256k1 & Secp256r1 based methods are equivalent.
     * Sr25519 is not available and will return an error.
     *
     * #### Precompile address
     * `0x0100000000000000000000000000000000000005`
     *
     * #### Gas Cost
     *
     * ##### Ed25519: 1,000 gas
     *
     * - `0` (`Ed25519Oasis`)
     * - `1` (`Ed25519Pure`)
     * - `2` (`Ed25519PrehashedSha512`)
     *
     * ##### Secp256k1: 1,500 gas.
     * - `3` (`Secp256k1Oasis`)
     * - `4` (`Secp256k1PrehashedKeccak256`)
     * - `5` (`Secp256k1PrehashedSha256`)
     *
     * ##### Secp256r1: 4,000 gas
     * - `7` (`Secp256r1PrehashedSha256`)
     *
     * ##### Secp384r1: 18,000 gas
     * - `8` (`Secp384r1PrehashedSha384`)
     *
     * #### Key Formats
     *
     * ##### Ed25519
     *
     * Public key: 32 bytes
     * Secret key: 32 bytes
     *
     * ##### Secp256k1 & Secp256r1
     *
     * Public key: 33 bytes, compressed format (`0x02` or `0x03` prefix, then 32
     * byte X coordinate).
     * Secret key: 32 bytes
     *
     * ##### Secp384r1
     *
     * Public key: 49 bytes, compressed format (`0x02` or `0x03` prefix, then 48
     * byte X coordinate).
     * Secret key: 48 bytes
     *
     * #### Example
     *
     * ```solidity
     * bytes memory seed = hex"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
     * bytes memory publicKey;
     * bytes memory privateKey;
     * (publicKey, privateKey) = Sapphire.generateSigningKeyPair(Sapphire.SigningAlg.Ed25519Pure, seed);
     * ```
     *
     * @param alg The signing alg for which to generate a keypair.
     * @param seed The seed to use for generating the key pair. You can use the
     * `randomBytes` method if you don't already have a seed.
     * @return publicKey The public part of the keypair.
     * @return secretKey The secret part of the keypair.
     */
    function generateSigningKeyPair(SigningAlg alg, bytes memory seed)
        internal
        view
        returns (bytes memory publicKey, bytes memory secretKey)
    {
        (bool success, bytes memory keypair) = GENERATE_SIGNING_KEYPAIR
            .staticcall(abi.encode(alg, seed));
        require(success, "gen signing keypair: failed");
        return abi.decode(keypair, (bytes, bytes));
    }

    /**
     * @notice Sign a message within the provided context using the specified
     * algorithm, and return the signature. The `contextOrHash` and
     * `message` parameters change in meaning slightly depending on the algorithm
     * requested:
     *
     * For algorithms that use domain-separation contexts:
     * - Ed25519Oasis and Secp256k1Oasis: Pass the domain separator context string as
     *   `contextOrHash` and the message to sign as `message`.
     *
     * For algorithms that use pre-computed hashes:
     * - Ed25519PrehashedSha512: Pass the SHA-512 hash (64 bytes) as `contextOrHash`
     *   and set `message` to empty.
     * - Secp256k1PrehashedKeccak256: Pass the Keccak256 hash (32 bytes) as `contextOrHash`
     *   and set `message` to empty. The hash should be computed as `bytes memory hash = abi.encodePacked(keccak256(message))`.
     * - Secp256k1PrehashedSha256: Pass the SHA-256 hash (32 bytes) as `contextOrHash`
     *   and set `message` to empty.
     * - Secp256r1PrehashedSha256: Pass the SHA-256 hash (32 bytes) as `contextOrHash`
     *   and set `message` to empty.
     * - Secp384r1PrehashedSha384: Pass the SHA-384 hash (48 bytes) as `contextOrHash`
     *   and set `message` to empty.
     *
     * For Sr25519 signatures (for Substrate compatibility):
     * - Sr25519: You MUST pass "substrate" as the `contextOrHash` parameter to ensure
     *   compatibility with Substrate off-chain signing that uses the `{ withType: true }`
     *   parameter. Pass the message to sign as the `message` parameter.
     *
     * #### Precompile address
     *
     * `0x0100000000000000000000000000000000000006`
     *
     * #### Gas cost
     *
     * See below for the method-dependent base cost, plus 8 gas per 32 bytes of
     * context and message except digest.
     *
     * #### Signing algorithms
     *
     * - `0` (`Ed25519Oasis`): 1,500 gas, variable length context and message.
     * - `1` (`Ed25519Pure`): 1,500 gas, empty context, variable length message.
     * - `2` (`Ed25519PrehashedSha512`): 1,500 gas, pre-existing SHA-512 hash
     *   (64 bytes) as context, empty message.
     * - `3` (`Secp256k1Oasis`): 3,000 gas, variable length context and message
     * - `4` (`Secp256k1PrehashedKeccak256`): 3,000 gas, pre-existing hash
     *   (32 bytes) as context, empty message.
     * - `5` (`Secp256k1PrehashedSha256`): 3,000 gas, pre-existing hash (32
     *   bytes) as context, empty message.
     * - `7` (`Secp256r1PrehashedSha256`): 9,000 gas, pre-existing hash (32
     *   bytes) as context, empty message.
     * - `8` (`Secp384r1PrehashedSha384`): 43,200 gas, pre-existing hash (48
     *   bytes) as context, empty message.
     *
     * #### Example
     *
     * ```solidity
     * // Example 1: Signing with Ed25519Pure
     * Sapphire.SigningAlg alg = Sapphire.SigningAlg.Ed25519Pure;
     * bytes memory pk;
     * bytes memory sk;
     * (pk, sk) = Sapphire.generateSigningKeyPair(alg, Sapphire.randomBytes(32, ""));
     * bytes memory signature = Sapphire.sign(alg, sk, "", "signed message");
     *
     * // Example 2: Signing with Secp256k1PrehashedKeccak256
     * alg = Sapphire.SigningAlg.Secp256k1PrehashedKeccak256;
     * bytes memory message = "message to sign";
     * bytes memory digest = abi.encodePacked(keccak256(message));
     * signature = Sapphire.sign(alg, sk, digest, "");
     *
     * // Example 3: Signing with Sr25519 (Substrate compatibility)
     * alg = Sapphire.SigningAlg.Sr25519;
     * bytes memory message = "message to sign";
     * signature = Sapphire.sign(alg, sk, "substrate", message);
     * ```
     *
     * @param alg The signing algorithm to use.
     * @param secretKey The secret key to use for signing. The key must be valid
     * for use with the requested algorithm.
     * @param contextOrHash Domain-Separator Context, or precomputed hash bytes.
     * The format and meaning depends on the selected algorithm (see above).
     * @param message Message to sign, should be zero-length if precomputed hash
     * given.
     * @return signature The resulting signature.
     * @custom:see @oasisprotocol/oasis-sdk :: precompile/confidential.rs :: call_sign
     */
    function sign(
        SigningAlg alg,
        bytes memory secretKey,
        bytes memory contextOrHash,
        bytes memory message
    ) internal view returns (bytes memory signature) {
        (bool success, bytes memory sig) = SIGN_DIGEST.staticcall(
            abi.encode(alg, secretKey, contextOrHash, message)
        );
        require(success, "sign: failed");
        return sig;
    }

    /**
     * @notice Verifies that the provided digest was signed using the
     * secret key corresponding to the provided public key and the specified
     * signing algorithm.
     *
     * The `contextOrHash` and `message` parameters behave the same way as in the
     * sign() function. Please refer to the [sign()](#sign) function documentation
     * for details on how these parameters should be used with each algorithm.
     *
     * #### Precompile address
     *
     * `0x0100000000000000000000000000000000000007`
     *
     * #### Gas cost
     *
     * The algorithm-specific base cost below, with an additional **8 gas per
     * 32 bytes** of `context` and `message` for the `Ed25519Oasis`,
     * `Ed25519Pure` and `Secp256k1Oasis` algorithms.
     *
     * - `0` (`Ed25519Oasis`): 2,000 gas
     * - `1` (`Ed25519Pure`): 2,000 gas
     * - `2` (`Ed25519PrehashedSha512`): 2,000 gas
     * - `3` (`Secp256k1Oasis`): 3,000 gas
     * - `4` (`Secp256k1PrehashedKeccak256`): 3,000 gas
     * - `5` (`Secp256k1PrehashedSha256`): 3,000 gas
     * - `7` (`Secp256r1PrehashedSha256`): 7,900 gas
     * - `8` (`Secp384r1PrehashedSha384`): 37,920 gas
     *
     * #### Example
     *
     * ```solidity
     * // Example 1: Verifying with Secp256k1PrehashedKeccak256
     * Sapphire.SigningAlg alg = Sapphire.SigningAlg.Secp256k1PrehashedKeccak256;
     * bytes memory pk;
     * bytes memory sk;
     * bytes memory message = "message to sign";
     * // Create the hash
     * bytes memory digest = abi.encodePacked(keccak256(message));
     * // Generate keys and sign
     * (pk, sk) = Sapphire.generateSigningKeyPair(alg, Sapphire.randomBytes(32, ""));
     * bytes memory signature = Sapphire.sign(alg, sk, digest, "");
     * // Verify the signature (pass the same hash used for signing)
     * bool isValid = Sapphire.verify(alg, pk, digest, "", signature);
     * require(isValid, "Invalid signature");
     *
     * // Example 2: Verifying with Sr25519 (Substrate compatibility)
     * alg = Sapphire.SigningAlg.Sr25519;
     * message = "message to sign";
     * // Sign with "substrate" context
     * signature = Sapphire.sign(alg, sk, "substrate", message);
     * // Verify with the same "substrate" context
     * isValid = Sapphire.verify(alg, pk, "substrate", message, signature);
     * require(isValid, "Invalid signature");
     * ```
     *
     * @param alg The signing algorithm by which the signature was generated.
     * @param publicKey The public key against which to check the signature.
     * @param contextOrHash Domain-Separator Context, or precomputed hash bytes.
     * The format and meaning depends on the selected algorithm (see above).
     * @param message The message that was signed, should be zero-length if
     * precomputed hash was given in contextOrHash.
     * @param signature The signature to verify.
     * @return verified Whether the signature is valid for the given parameters.
     * @custom:see @oasisprotocol/oasis-sdk :: precompile/confidential.rs :: call_verify
     */
    function verify(
        SigningAlg alg,
        bytes memory publicKey,
        bytes memory contextOrHash,
        bytes memory message,
        bytes memory signature
    ) internal view returns (bool verified) {
        (bool success, bytes memory v) = VERIFY_DIGEST.staticcall(
            abi.encode(alg, publicKey, contextOrHash, message, signature)
        );
        require(success, "verify: failed");
        return abi.decode(v, (bool));
    }

    /**
     * @notice Set the current transactions gas usage to a specific amount
     * @dev Will cause a reversion if the current usage is more than the amount.
     * @param toAmount Gas usage will be set to this amount
     * @custom:see @oasisprotocol/oasis-sdk :: precompile/gas.rs :: call_pad_gas
     *
     */
    function padGas(uint128 toAmount) internal view {
        (bool success, ) = PAD_GAS.staticcall(abi.encode(toAmount));
        require(success, "verify: failed");
    }

    /**
     * @notice Returns the amount of gas currently used by the transaction
     * @custom:see @oasisprotocol/oasis-sdk :: precompile/gas.rs :: call_gas_used
     */
    function gasUsed() internal view returns (uint64) {
        (bool success, bytes memory v) = GAS_USED.staticcall("");
        require(success, "gasused: failed");
        return abi.decode(v, (uint64));
    }
}

/**
 * @notice Hash the input data with SHA-512/256, according to
 * [NIST.FIPS.180-4](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf).
 *
 * #### Precompile address
 *
 * `0x0100000000000000000000000000000000000102`
 *
 * #### Gas cost
 *
 * 115 gas, then 13 gas per word
 *
 * #### Example
 *
 * ```solidity
 * bytes32 result = sha512_256(abi.encodePacked("input data"));
 * ```
 *
 * #### Warning: SHA-512 vs SHA-512/256 Length-Extension Attacks
 *
 * [SHA-512](function.sha512.md#sha512) is vulnerable to [length-extension
 * attacks](https://en.wikipedia.org/wiki/Length_extension_attack), which are
 * relevant if you are computing the hash of a secret message. The
 * [SHA-512/256](function.sha512_256.md#sha512_256) variant is **not**
 * vulnerable to length-extension attacks.
 *
 * @param input Bytes to hash.
 * @return result 32 byte digest.
 * @custom:standard https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf
 * @custom:see @oasisprotocol/oasis-sdk :: precompile/sha2.rs :: call_sha512_256
 */
function sha512_256(bytes memory input) view returns (bytes32 result) {
    (bool success, bytes memory output) = Sapphire.SHA512_256.staticcall(input);

    require(success, "sha512_256");

    return bytes32(output);
}

/**
 * @notice Hash the input data with SHA-512, according to
 * [NIST.FIPS.180-4](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf)
 *
 * #### Precompile address
 *
 * `0x0100000000000000000000000000000000000101`
 *
 * #### Warning: SHA-512 vs SHA-512/256 Length-Extension Attacks
 *
 * [SHA-512](function.sha512.md#sha512) is vulnerable to [length-extension
 * attacks](https://en.wikipedia.org/wiki/Length_extension_attack), which are
 * relevant if you are computing the hash of a secret message. The
 * [SHA-512/256](function.sha512_256.md#sha512_256) variant is **not**
 * vulnerable to length-extension attacks.
 *
 * #### Gas Cost
 *
 * 115 gas, then 13 gas per word
 *
 * #### Example
 *
 * ```solidity
 * bytes memory result = sha512(abi.encodePacked("input data"));
 * ```
 *
 * @param input Bytes to hash.
 * @return output 64 byte digest.
 * @custom:standard https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf
 * @custom:see @oasisprotocol/oasis-sdk :: precompile/sha2.rs :: call_sha512
 */
function sha512(bytes memory input) view returns (bytes memory output) {
    bool success;

    (success, output) = Sapphire.SHA512.staticcall(input);

    require(success, "sha512");
}

/**
 * @notice Hash the input data with SHA-384.
 * @param input Bytes to hash.
 * @return output 48 byte digest.
 * @custom:standard https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf
 * @custom:see @oasisprotocol/oasis-sdk :: precompile/sha2.rs :: call_sha384
 */
function sha384(bytes memory input) view returns (bytes memory output) {
    bool success;

    (success, output) = Sapphire.SHA384.staticcall(input);

    require(success, "sha384");
}
