// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {console} from "forge-std/console.sol";

import "./BinaryHandler.sol";
import "./Precompiles.sol";

abstract contract SapphireTest is Test, Precompiles {
    BinaryHandler binaryHandler;

    function setUp() public virtual {
        binaryHandler = new BinaryHandler();
    }
}
