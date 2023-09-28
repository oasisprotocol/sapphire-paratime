// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

contract SemanticTests {
    function testViewLength (uint256 len) external pure returns (bytes memory)
    {
        return new bytes(len);
    }

    error CustomError(uint value);
    uint private x;

    uint constant ERROR_NUM = 0x1023456789abcdef1023456789abcdef1023456789abcdef1023456789abcdef;

    function testCustomRevert () external {
        x += 1;
        revert CustomError(ERROR_NUM);
    }

    function testCustomViewRevert () external pure returns (uint) {
        revert CustomError(ERROR_NUM);
    }
}