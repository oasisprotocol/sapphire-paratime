// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import {sha512_256} from "./Sapphire.sol";

// Note that the SHA512_256 block size is 128 bytes, while the output is 32 bytes
uint256 constant SHA512_256_BLOCK_SIZE = 128;

// We don't (yet) have the MCOPY opcode, so use the IDENTITY precompile
uint256 constant PRECOMPILE_IDENTITY_ADDRESS = 0x4;

// HMAC block-sized inner padding
bytes32 constant HMAC_IPAD = 0x3636363636363636363636363636363636363636363636363636363636363636;

// OPAD ^ IPAD, (OPAD = 0x5c)
bytes32 constant HMAC_OPAD_XOR_IPAD = 0x6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a;

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
 * bytes32 hmac = HMAC_sha512_256(key, message)
 * ```
 */
function HMAC_sha512_256(bytes memory key, bytes memory message)
    view
    returns (bytes32)
{
    // Declare a memory array of 4 elements, each element is a bytes32
    bytes32[4] memory buf;

    // If the key length is greater than the SHA512_256_BLOCK_SIZE constant
    if (key.length > SHA512_256_BLOCK_SIZE) {
        // Hash the key using SHA512-256 and store the result in the first element of buf
        buf[0] = sha512_256(key);
    } else {
        // If the key is not longer than the block size, we'll copy it directly
        bool success;

        // Use inline assembly for low-level operations
        assembly {
            // Get the length of the key
            let size := mload(key)
            // Call the identity precompile to copy memory
            success := staticcall(
                gas(),           // Forward all available gas
                PRECOMPILE_IDENTITY_ADDRESS,  // Address of the identity precompile
                add(32, key),    // Start of the key data (skip the length prefix)
                size,            // Length of data to copy
                buf,             // Destination to copy to
                size             // Amount of memory to copy
            )
        }

        // Ensure the memory copy was successful
        require(success, "memcpy");
    }

    for (uint256 i = 0; i < buf.length; i++) {
        buf[i] ^= HMAC_IPAD;
    }

    bytes32 ihash = sha512_256(abi.encodePacked(buf, message));

    for (uint256 i = 0; i < buf.length; i++) {
        buf[i] ^= HMAC_OPAD_XOR_IPAD;
    }

    return sha512_256(abi.encodePacked(buf, ihash));
}
