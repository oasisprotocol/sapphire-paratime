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

function HMAC_sha512_256(bytes memory key, bytes memory message)
    view
    returns (bytes32)
{
    bytes32[4] memory buf;

    if (key.length > SHA512_256_BLOCK_SIZE) {
        buf[0] = sha512_256(key);
    } else {
        bool success;

        assembly {
            let size := mload(key)
            success := staticcall(
                gas(),
                PRECOMPILE_IDENTITY_ADDRESS,
                add(32, key), // Skip uint256 length prefix of key bytes
                size,
                buf,
                size
            )
        }

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
