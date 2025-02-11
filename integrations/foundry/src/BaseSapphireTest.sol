// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {console} from "forge-std/console.sol";

import "../src/TestCalldataEncryption.sol";
import "@oasisprotocol-sapphire-contracts-0.2.11/Subcall.sol";
import "./BinaryHandler.sol";
import "./Counter.sol";

abstract contract SapphireTest is Test {
    TestCalldataEncryption testCalldataEncryption;
    BinaryHandler binaryHandler;
    Counter counter;

    function setUp() public virtual {
        testCalldataEncryption = new TestCalldataEncryption();
        binaryHandler = new BinaryHandler();
        counter = new Counter();
    }
}
