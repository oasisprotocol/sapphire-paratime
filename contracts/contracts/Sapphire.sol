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

    /**
     * @dev Generate a public/private key pair using the specified method and seed.
     * @param method The method to use (0 - ed25519, 1 - secp256k1, 2 - sr25519).
     * @param seed The seed to use for generating the key pair.
     * @return (publicKey, privateKey) The generated key pair.
     */
    function generateKeyPair(uint method, bytes memory seed) internal view returns (bytes memory publicKey, bytes memory privateKey) {
        assembly {
            let buf := mload(0x40)
            let seedLen := mload(seed)
            mstore(buf, method)
            mstore(add(buf, 0x20), seedLen)
            for { let i := 0 } lt(i, seedLen) { i := add(i, 0x20) } {
                mstore(add(buf, add(0x40, i)), mload(add(seed, add(0x20, i))))
            }
            let success := staticcall(gas(), 0x0100000000000000000000000000000000000005, buf, add(0x40, seedLen), buf, 0x40)
            if iszero(success) {
                revert(0, 0)
            }

            publicKey := mload(0x40)
            returndatacopy(publicKey, 0, 0x20)
            let publicKeyLen := mload(publicKey)
            returndatacopy(add(publicKey, 0x20), 0x40, publicKeyLen)

            let rounded := and(add(publicKeyLen, 0x1f), not(0x1f))
            rounded := add(rounded, 0x20)
            privateKey := add(publicKey, rounded)
            returndatacopy(privateKey, 0x20, 0x20)
            let privateKeyLen := mload(privateKey)
            rounded := add(rounded, 0x20)
            returndatacopy(add(privateKey, 0x20), rounded, privateKeyLen)

            let total := and(add(privateKeyLen, 0x1f), not(0x1f))
            total := add(rounded, total)
            mstore(0x40, add(publicKey, total))
        }
    }

    /**
     * @dev Sign a message within the provided context using the specified method, and return the signature.
     * @param method The method to use (0 - ed25519, 1 - secp256k1, 2 - sr25519).
     * @param privateKey The private key to use for signing.
     * @param context The context to add to the message before signing.
     * @param message The message to sign.
     * @return signature The resulting signature.
     */
    function signMessageWithContext(uint method, bytes memory privateKey, bytes memory context, bytes memory message) internal view returns (bytes memory signature) {
        assembly {
            let buf := mload(0x40)
            let privateKeyLen := mload(privateKey)
            let contextLen := mload(context)
            let messageLen := mload(message)
            mstore(buf, method)
            mstore(add(buf, 0x20), privateKeyLen)
            mstore(add(buf, 0x40), contextLen)
            mstore(add(buf, 0x60), messageLen)
            let offset := add(buf, 0x80)
            privateKeyLen := add(privateKeyLen, 0x20)
            for { let i := 0x20 } lt(i, privateKeyLen) { i := add(i, 0x20) } {
                mstore(offset, mload(add(privateKey, i)))
                offset := add(offset, 0x20)
            }
            contextLen := add(contextLen, 0x20)
            for { let i := 0x20 } lt(i, contextLen) { i := add(i, 0x20) } {
                mstore(offset, mload(add(context, i)))
                offset := add(offset, 0x20)
            }
            messageLen := add(messageLen, 0x20)
            for { let i := 0x20 } lt(i, messageLen) { i := add(i, 0x20) } {
                mstore(add(offset, i), mload(add(message, i)))
                offset := add(offset, 0x20)
            }
            let success := staticcall(gas(), 0x0100000000000000000000000000000000000006, buf, sub(offset, buf), buf, 0x40)
            if iszero(success) {
                revert(0, 0)
            }

            signature := mload(0x40)
            let signatureLen := returndatasize()
            mstore(signature, signatureLen)
            returndatacopy(add(signature, 0x20), 0, signatureLen)
            let rounded := and(add(signatureLen, 0x1f), not(0x1f))
            mstore(0x40, add(signature, add(rounded, 0x20)))
        }
    }

    /**
     * @dev Verify that the context and message correspond to the given signature.
     * @param method The method to use (0 - ed25519, 1 - secp256k1, 2 - sr25519).
     * @param publicKey The public key to use to check the signature.
     * @param signature The signature to check.
     * @param context The context to add to the message before checking.
     * @param message The message to check.
     * @return result The result of the verification; `True` if the verification succeeded.
     */
    function verifySignatureWithContext(uint method, bytes memory publicKey, bytes memory signature, bytes memory context, bytes memory message) internal view returns (bool result) {
        assembly {
            let buf := mload(0x40)
            let publicKeyLen := mload(publicKey)
            let signatureLen := mload(signature)
            let contextLen := mload(context)
            let messageLen := mload(message)
            mstore(buf, method)
            mstore(add(buf, 0x20), publicKeyLen)
            mstore(add(buf, 0x40), signatureLen)
            mstore(add(buf, 0x60), contextLen)
            mstore(add(buf, 0x80), messageLen)
            let offset := add(buf, 0xa0)
            publicKeyLen := add(publicKeyLen, 0x20)
            for { let i := 0x20 } lt(i, publicKeyLen) { i := add(i, 0x20) } {
                mstore(offset, mload(add(publicKey, i)))
                offset := add(offset, 0x20)
            }
            signatureLen := add(signatureLen, 0x20)
            for { let i := 0x20 } lt(i, signatureLen) { i := add(i, 0x20) } {
                mstore(offset, mload(add(signature, i)))
                offset := add(offset, 0x20)
            }
            contextLen := add(contextLen, 0x20)
            for { let i := 0x20 } lt(i, contextLen) { i := add(i, 0x20) } {
                mstore(offset, mload(add(context, i)))
                offset := add(offset, 0x20)
            }
            messageLen := add(messageLen, 0x20)
            for { let i := 0x20 } lt(i, messageLen) { i := add(i, 0x20) } {
                mstore(add(offset, i), mload(add(message, i)))
                offset := add(offset, 0x20)
            }
            let success := staticcall(gas(), 0x0100000000000000000000000000000000000007, buf, sub(offset, buf), buf, 0x40)
            if iszero(success) {
                revert(0, 0)
            }

            buf := mload(0x40)
            returndatacopy(buf, 0, returndatasize())
            result := mload(buf)
        }
    }
}
