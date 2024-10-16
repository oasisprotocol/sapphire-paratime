// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import "../CBOR.sol" as CBOR;

contract TestCBOR {
    function testBytesEncoding(bytes memory in_data)
        external pure
        returns (bytes memory)
    {
        return CBOR.encodeBytes(in_data);
    }

    function testUintEncoding(uint value)
        external pure
        returns (bytes memory)
    {
        return CBOR.encodeUint(value);
    }

    function testParseUint(bytes memory result, uint256 offset)
        external
        pure
        returns (uint256, uint256)
    {
        return CBOR.parseUint(result, offset);
    }

    function testUintRoundtrip(uint value)
        external pure
        returns (bool)
    {
        bytes memory encoded = CBOR.encodeUint(value);
        (uint newOffset, uint result) = CBOR.parseUint(encoded, 0);
        require( result == value, "value wrong!" );
        require( newOffset == encoded.length, "didn't parse everything!" );
        return true;
    }
}
