// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

contract SemanticTests {
    function testViewLength (uint256 len) external pure returns (bytes memory)
    {
        return new bytes(len);
    }
}