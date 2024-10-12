// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import {CBOR_parseUint,CBOR_encodeUint,CBOR_encodeBytes} from "../CBOR.sol";

contract TestCBOR {
    function testBytesEncoding(bytes memory in_data)
        external pure
        returns (bytes memory)
    {
        return CBOR_encodeBytes(in_data);
    }

    function testUintEncoding(uint value)
        external pure
        returns (bytes memory)
    {
        return CBOR_encodeUint(value);
    }

    function testParseUint(bytes memory result, uint256 offset)
        external
        pure
        returns (uint256, uint256)
    {
        return CBOR_parseUint(result, offset);
    }

    function testUintRoundtrip(uint value)
        external pure
        returns (bool)
    {
        bytes memory encoded = CBOR_encodeUint(value);
        (uint newOffset, uint result) = CBOR_parseUint(encoded, 0);
        require( result == value, "value wrong!" );
        require( newOffset == encoded.length, "didn't parse everything!" );
        return true;
    }
}