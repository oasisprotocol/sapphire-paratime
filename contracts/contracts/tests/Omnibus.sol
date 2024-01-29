// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import {SignedQueriesTests} from "./SignedQueriesTests.sol";
import {SemanticTests} from "./SemanticTests.sol";

contract Omnibus is SignedQueriesTests, SemanticTests {
    uint256 public somevar;

    function setSomevar(uint256 value) external {
        somevar = value;
    }
}
