// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {ParsedSiweMessage, SiweParser} from "../SiweParser.sol";

contract SiweParserTests {
    function testHexStringToAddress(bytes memory addr)
        external
        pure
        returns (address)
    {
        return SiweParser._hexStringToAddress(addr);
    }

    function testFromHexChar(uint8 c) external pure returns (uint8) {
        return SiweParser._fromHexChar(c);
    }

    function testSubstr(
        bytes memory str,
        uint256 startIndex,
        uint256 endIndex
    ) external pure returns (bytes memory) {
        return SiweParser._substr(str, startIndex, endIndex);
    }

    function testParseUint(bytes memory b) external pure returns (uint256) {
        return SiweParser._parseUint(b);
    }

    function testParseField(
        bytes calldata str,
        string memory name,
        uint256 i
    ) external pure returns (bytes memory value, uint256) {
        return SiweParser._parseField(str, name, i);
    }

    function testParseArray(bytes calldata str, uint256 i)
        external
        pure
        returns (bytes[] memory values, uint256 count)
    {
        return SiweParser._parseArray(str, i);
    }

    function testParseSiweMsg(bytes calldata siweMsg)
        external
        pure
        returns (ParsedSiweMessage memory)
    {
        return SiweParser.parseSiweMsg(siweMsg);
    }

    function testTimestampFromIso(bytes memory str)
        external
        pure
        returns (uint256)
    {
        return SiweParser.timestampFromIso(str);
    }
}
