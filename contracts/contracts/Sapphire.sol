// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/**
 * @title Sapphire
 * @dev Convenient wrapper methods for Sapphire's cryptographic primitives.
 */
library Sapphire {
    /**
     * @dev Derive a symmetric key from a public/private key pair using x25519.
     * @param keyPublic The public key.
     * @param keyPrivate The corresponding private key.
     * @return A derived symmetric key.
     */
    function deriveSymmetricKey(bytes32 keyPublic, bytes32 keyPrivate)
        internal
        view
        returns (bytes32)
    {
        bytes32[3] memory data;
        data[0] = keyPublic;
        data[1] = keyPrivate;
        assembly {
            let success := staticcall(
                gas(),
                0x0100000000000000000000000000000000000002,
                data,
                0x40,
                add(data, 0x40),
                0x20
            )
            if iszero(success) {
                revert(0, 0)
            }
        }
        return data[2];
    }

    /**
     * @dev Encrypt and authenticate the plaintext and additional data using DeoxysII.
     * @param key The key to use for encryption.
     * @param nonce The nonce. Note that only the first 15 bytes of this parameter are used.
     * @param text The plaintext to encrypt and authenticate.
     * @param additionalData The additional data to authenticate.
     * @return result The tagged encrypted result.
     */
    function encrypt(
        bytes32 key,
        bytes32 nonce,
        bytes memory text,
        bytes memory additionalData
    ) internal view returns (bytes memory result) {
        assembly {
            let p := mload(0x40)
            mstore(p, key)
            mstore(add(p, 0x20), nonce)
            let text_len := mload(text)
            mstore(add(p, 0x40), text_len)
            let ad_len := mload(additionalData)
            mstore(add(p, 0x60), ad_len)
            let i := 0
            for {
                i := 0
            } lt(i, text_len) {
                i := add(i, 0x20)
            } {
                mstore(add(add(p, 0x80), i), mload(add(add(text, 0x20), i)))
            }
            let ad_begin := add(add(p, 0x80), i)
            for {
                i := 0
            } lt(i, ad_len) {
                i := add(i, 0x20)
            } {
                mstore(
                    add(ad_begin, i),
                    mload(add(add(additionalData, 0x20), i))
                )
            }
            mstore(0x40, add(ad_begin, i))
            let out := mload(0x40)
            let success := staticcall(
                gas(),
                0x0100000000000000000000000000000000000003,
                p,
                sub(out, p),
                out,
                1
            )
            if iszero(success) {
                revert(0, 0)
            }
            mstore(out, returndatasize())
            returndatacopy(add(out, 0x20), 0, returndatasize())
            mstore(0x40, add(add(out, 0x20), returndatasize()))
            result := out
        }
    }

    /**
     * @dev Decrypt and authenticate the ciphertext and additional data using DeoxysII.
     * @param key The key to use for decryption.
     * @param nonce The nonce. Note that only the first 15 bytes of this parameter are used.
     * @param ciphertext The ciphertext with tag to decrypt and authenticate.
     * @param additionalData The additional data to authenticate against the ciphertext.
     * @return result The decrypted result.
     */
    function decrypt(
        bytes32 key,
        bytes32 nonce,
        bytes memory ciphertext,
        bytes memory additionalData
    ) internal view returns (bytes memory result) {
        assembly {
            let p := mload(0x40)
            mstore(p, key)
            mstore(add(p, 0x20), nonce)
            let text_len := mload(ciphertext)
            mstore(add(p, 0x40), text_len)
            let ad_len := mload(additionalData)
            mstore(add(p, 0x60), ad_len)
            let i := 0
            for {
                i := 0
            } lt(i, text_len) {
                i := add(i, 0x20)
            } {
                mstore(
                    add(add(p, 0x80), i),
                    mload(add(add(ciphertext, 0x20), i))
                )
            }
            let ad_begin := add(add(p, 0x80), i)
            for {
                i := 0
            } lt(i, ad_len) {
                i := add(i, 0x20)
            } {
                mstore(
                    add(ad_begin, i),
                    mload(add(add(additionalData, 0x20), i))
                )
            }
            mstore(0x40, add(ad_begin, i))
            let out := mload(0x40)
            let success := staticcall(
                gas(),
                0x0100000000000000000000000000000000000004,
                p,
                sub(out, p),
                out,
                1
            )
            if iszero(success) {
                revert(0, 0)
            }
            mstore(out, returndatasize())
            returndatacopy(add(out, 0x20), 0, returndatasize())
            mstore(0x40, add(add(out, 0x20), returndatasize()))
            result := out
        }
    }
}
