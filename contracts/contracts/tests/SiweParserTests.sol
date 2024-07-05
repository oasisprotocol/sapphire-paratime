// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import { ParsedSiweMessage, SiweParser } from "../SiweParser.sol";

contract SiweParserTests {
    function testHexStringToAddress(bytes memory addr) external view returns (address) {
        return SiweParser._hexStringToAddress(addr);
    }

    function testFromHexChar(uint8 c) external view returns (uint8) {
        return SiweParser._fromHexChar(c);
    }

    function testSubstr(bytes memory str, uint startIndex, uint endIndex) external view returns (bytes memory) {
        return SiweParser._substr(str, startIndex, endIndex);
    }

    function testParseUint(bytes memory b) external view returns (uint) {
        return SiweParser._parseUint(b);
    }

    function testParseField(bytes calldata str, string memory name, uint i) external view returns (bytes memory value, uint) {
        return SiweParser._parseField(str, name, i);
    }

    function testParseArray(bytes calldata str, uint i) external view returns (bytes[] memory values, uint count) {
        return SiweParser._parseArray(str, i);
    }

    function testParseSiweMsg(bytes calldata siweMsg) external view returns (ParsedSiweMessage memory) {
        return SiweParser.parseSiweMsg(siweMsg);
    }

    function testTimestampFromIso(bytes memory str) external pure returns (uint256) {
        return SiweParser.timestampFromIso(str);
    }
}
