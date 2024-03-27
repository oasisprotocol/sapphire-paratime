// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

contract CreateFailCustom {
    uint256 constant ERROR_NUM =
        0x1023456789abcdef1023456789abcdef1023456789abcdef1023456789abcdef;

    error CustomError(uint256 value);

    constructor () {
        revert CustomError(ERROR_NUM);
    }
}
