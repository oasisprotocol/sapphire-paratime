// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {ROFLableUpgradeable} from "../ROFLableUpgradeable.sol";

contract ROFLableUpgradeableTests is ROFLableUpgradeable {
    uint256 private _counter;

    function initialize(bytes21 inRoflAppId) external initializer {
        __ROFLable_init(inRoflAppId);
    }

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
