// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import {sha512_256} from "./Sapphire.sol";

// Note that the SHA512_256 block size is 128 bytes, while the output is 32 bytes
uint256 constant SHA512_256_BLOCK_SIZE = 128;

// We don't (yet) have the MCOPY opcode, so use the IDENTITY precompile
uint256 constant PRECOMPILE_IDENTITY_ADDRESS = 4;

// HMAC block-sized inner padding
bytes32 constant HMAC_IPAD = 0x3636363636363636363636363636363636363636363636363636363636363636;

// OPAD ^ IPAD, (OPAD = 0x5c)
bytes32 constant HMAC_OPAD_XOR_IPAD = 0x6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a;

/// Copying key buffer failed (identity precompile error?)
error hmac_sha512_256_memcpy();

/**
 * @notice Implements HMAC using SHA512-256.
 * @dev https://en.wikipedia.org/wiki/HMAC
 * @param key the secret key.
 * @param message the message to be authenticated.
 *
 * #### Example
 *
 * ```solidity
 * bytes memory key = "arbitrary length key";
 * bytes memory message = "arbitrary length message";
 * bytes32 hmac = hmac_sha512_256(key, message)
 * ```
 */
function hmac_sha512_256(bytes memory key, bytes memory message)
    view
    returns (bytes32)
{
    // Buffer is SHA512_256_BLOCK_SIZE bytes
    bytes32[4] memory buf;

    // Key is hashed if longer than SHA512_256_BLOCK_SIZE
    // Otherwise, copy into block buffer using the identity precompile
    if (key.length > SHA512_256_BLOCK_SIZE) {
        buf[0] = sha512_256(key);
    } else {
        bool success;
        assembly {
            let size := mload(key)
            success := staticcall(
                gas(),
                PRECOMPILE_IDENTITY_ADDRESS,
                add(32, key), // Skip 32 bytes for the key length
                size,
                buf,
                size
            )
        }
        if (!success) {
            revert hmac_sha512_256_memcpy();
        }
    }

    buf[0] ^= HMAC_IPAD;
    buf[1] ^= HMAC_IPAD;
    buf[2] ^= HMAC_IPAD;
    buf[3] ^= HMAC_IPAD;

    bytes32 ihash = sha512_256(abi.encodePacked(buf, message));

    buf[0] ^= HMAC_OPAD_XOR_IPAD;
    buf[1] ^= HMAC_OPAD_XOR_IPAD;
    buf[2] ^= HMAC_OPAD_XOR_IPAD;
    buf[3] ^= HMAC_OPAD_XOR_IPAD;

    return sha512_256(abi.encodePacked(buf, ihash));
}
