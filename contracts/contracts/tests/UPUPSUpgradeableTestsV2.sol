// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {UPUPSUpgradeableTests} from "./UPUPSUpgradeableTests.sol";

contract UPUPSUpgradeableTestsV2 is UPUPSUpgradeableTests {
    function version() external pure override returns (uint256) {
        return 2;
    }
}
