// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {ROFLable} from "../ROFLable.sol";

contract ROFLableTests is ROFLable {
    uint256 private _counter;

    constructor(bytes21 inRoflAppId) ROFLable(inRoflAppId) {}

    function testOnlyROFL() external onlyROFL returns (uint256) {
        _counter++;
        return _counter;
    }

    // For testing, pass all onlyROFL calls if configured ROFL app id is zero.
    function _checkRoflAppId() internal view override {
        if (roflAppId() != bytes21(0)) {
            super._checkRoflAppId();
        }
    }
}
