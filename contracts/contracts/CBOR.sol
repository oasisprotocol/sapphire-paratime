// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

/// While parsing CBOR map, unexpected key
error CBOR_Error_InvalidKey();

/// While parsing CBOR map, length is invalid, or other parse error
error CBOR_Error_InvalidMap();

/// While parsing CBOR structure, data length was unexpected
error CBOR_Error_InvalidLength(uint256);

/// Value cannot be parsed as a uint
error CBOR_Error_InvalidUintPrefix(uint8);

/// Unsigned integer of unknown size
error CBOR_Error_InvalidUintSize(uint8);

/// CBOR parsed value is out of expected range
error CBOR_Error_ValueOutOfRange();

error CBOR_Error_BytesTooLong(uint256 byteLength);

function encodeUint(uint256 value) pure returns (bytes memory) {
    // NOTE: we don't follow bignum tagged encoding
    // See: https://www.rfc-editor.org/rfc/rfc8949.html#section-3.4.3
    if (value < 24) {
        return abi.encodePacked(uint8(value));
    } else if (value <= type(uint8).max) {
        return abi.encodePacked(uint8(24), uint8(value));
    } else if (value <= type(uint16).max) {
        return abi.encodePacked(uint8(25), uint16(value));
    } else if (value <= type(uint32).max) {
        return abi.encodePacked(uint8(26), uint32(value));
    } else if (value <= type(uint64).max) {
        return abi.encodePacked(uint8(27), uint64(value));
    } else if (value <= type(uint128).max) {
        return abi.encodePacked(uint8(0x50), uint128(value));
    }
    return abi.encodePacked(uint8(0x58), uint256(32), value);
}

function encodeBytes(bytes memory in_bytes)
    pure
    returns (bytes memory out_cbor)
{
    /*
    0x40..0x57 	byte string (0x00..0x17 bytes follow)
    0x58 	byte string (one-byte uint8_t for n, and then n bytes follow)
    0x59 	byte string (two-byte uint16_t for n, and then n bytes follow)
    0x5a 	byte string (four-byte uint32_t for n, and then n bytes follow)
    0x5b 	byte string (eight-byte uint64_t for n, and then n bytes follow)
    */
    if (in_bytes.length <= 0x17) {
        return abi.encodePacked(uint8(0x40 + in_bytes.length), in_bytes);
    }
    if (in_bytes.length <= 0xFF) {
        return abi.encodePacked(uint8(0x58), uint8(in_bytes.length), in_bytes);
    }
    if (in_bytes.length <= 0xFFFF) {
        return abi.encodePacked(uint8(0x59), uint16(in_bytes.length), in_bytes);
    }
    // We assume Solidity won't be encoding anything larger than 64kb
    revert CBOR_Error_BytesTooLong(in_bytes.length);
}

function parseMapStart(bytes memory in_data, uint256 in_offset)
    pure
    returns (uint256 n_entries, uint256 out_offset)
{
    uint256 b = uint256(uint8(in_data[in_offset]));
    if (b < 0xa0 || b > 0xb7) {
        revert CBOR_Error_InvalidMap();
    }

    n_entries = b - 0xa0;
    out_offset = in_offset + 1;
}

function parseUint(bytes memory result, uint256 offset)
    pure
    returns (uint256 newOffset, uint256 value)
{
    uint8 prefix = uint8(result[offset]);
    uint256 len;

    if (prefix <= 0x17) {
        return (offset + 1, prefix);
    }
    // Byte array(uint256), parsed as a big-endian integer.
    else if (prefix == 0x58) {
        len = uint8(result[++offset]);
        offset++;
    }
    // Byte array, parsed as a big-endian integer.
    else if (prefix & 0x40 == 0x40) {
        len = uint8(result[offset++]) ^ 0x40;
    }
    // Unsigned integer, CBOR encoded.
    else if (prefix & 0x10 == 0x10) {
        if (prefix == 0x18) {
            len = 1;
        } else if (prefix == 0x19) {
            len = 2;
        } else if (prefix == 0x1a) {
            len = 4;
        } else if (prefix == 0x1b) {
            len = 8;
        } else {
            revert CBOR_Error_InvalidUintSize(prefix);
        }
        offset += 1;
    }
    // Unknown...
    else {
        revert CBOR_Error_InvalidUintPrefix(prefix);
    }

    if (len > 0x20) revert CBOR_Error_InvalidLength(len);

    // Load 32 bytes from the buffer at the given offset
    assembly {
        value := mload(add(add(0x20, result), offset))
    }

    // Then shift the value right, until it matches the required bit-width
    value = value >> (256 - (len * 8));

    newOffset = offset + len;
}

function parseUint64(bytes memory result, uint256 offset)
    pure
    returns (uint256 newOffset, uint64 value)
{
    uint256 tmp;

    (newOffset, tmp) = parseUint(result, offset);

    if (tmp > type(uint64).max) revert CBOR_Error_ValueOutOfRange();

    value = uint64(tmp);
}

function parseUint128(bytes memory result, uint256 offset)
    pure
    returns (uint256 newOffset, uint128 value)
{
    uint256 tmp;

    (newOffset, tmp) = parseUint(result, offset);

    if (tmp > type(uint128).max) revert CBOR_Error_ValueOutOfRange();

    value = uint128(tmp);
}

function parseKey(bytes memory result, uint256 offset)
    pure
    returns (uint256 newOffset, bytes32 keyDigest)
{
    if (result[offset] & 0x60 != 0x60) revert CBOR_Error_InvalidKey();

    uint8 len = uint8(result[offset++]) ^ 0x60;

    assembly {
        keyDigest := keccak256(add(add(0x20, result), offset), len)
    }

    newOffset = offset + len;
}
