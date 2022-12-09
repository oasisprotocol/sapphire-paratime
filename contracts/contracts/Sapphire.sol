// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/**
 * @title Sapphire
 * @dev Convenient wrapper methods for Sapphire's cryptographic primitives.
 */
library Sapphire {
    address private constant RANDOM_BYTES =
        0x0100000000000000000000000000000000000001;
    address private constant DERIVE_KEY =
        0x0100000000000000000000000000000000000002;
    address private constant ENCRYPT =
        0x0100000000000000000000000000000000000003;
    address private constant DECRYPT =
        0x0100000000000000000000000000000000000004;

    /**
     * @dev Returns cryptographically secure random bytes.
     * @param numBytes The number of bytes to return.
     * @param pers An optional personalization string to increase domain separation.
     * @return The random bytes. If the number of bytes requested is too large (over 1024), a smaller amount (1024) will be returned.
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
     * @dev Derive a symmetric key from a pair of keys using x25519.
     * @param peerPublicKey The peer's public key.
     * @param secretKey Your secret key.
     * @return A derived symmetric key.
     */
    function deriveSymmetricKey(bytes32 peerPublicKey, bytes32 secretKey)
        internal
        view
        returns (bytes32)
    {
        (bool success, bytes memory symmetric) = DERIVE_KEY.staticcall(
            abi.encode(peerPublicKey, secretKey)
        );
        require(success, "deriveSymmetricKey: failed");
        return bytes32(symmetric);
    }

    /**
     * @dev Encrypt and authenticate the plaintext and additional data using DeoxysII.
     * @param key The key to use for encryption.
     * @param nonce The nonce. Note that only the first 15 bytes of this parameter are used.
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
     * @dev Decrypt and authenticate the ciphertext and additional data using DeoxysII. Reverts if the auth tag is incorrect.
     * @param key The key to use for decryption.
     * @param nonce The nonce. Note that only the first 15 bytes of this parameter are used.
     * @param ciphertext The ciphertext with tag to decrypt and authenticate.
     * @param additionalData The additional data to authenticate against the ciphertext.
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
}
