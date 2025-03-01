// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import {console} from "forge-std/console.sol";
import "lib/oasisprotocol-sapphire-foundry/BaseSapphireTest.sol";
import "lib/oasisprotocol-sapphire-contracts/CalldataEncryption.sol";
import "../src/Counter.sol";

contract TestCounter is SapphireTest {
    Counter counter;

    receive() external payable {}
    
    function setUp() public override {
        super.setUp(); // Call parent setUp first
        counter = new Counter();
    }

    /*
    Fuzz tests for the Counter contract with different withdraw amounts.
    */  
    function testFuzz_Withdraw(uint96 amount) public {
        console.log("Contract balance: ", address(this).balance);
        payable(address(counter)).transfer(amount);
        uint256 preBalance = address(this).balance;
        counter.withdraw();
        uint256 postBalance = address(this).balance;
        assertEq(preBalance + amount, postBalance);
    }

    /*
    Test decryption using the SapphireDecryptor contract.  
    */  
    function testCounterEncryptCallData() public {
        // Test encryption using Sapphire Contracts.
        bytes memory encryptedData = encryptCallData(
            abi.encodeWithSelector(counter.increment.selector)
        );
        // DECODE is a custom precompile for 
        // testing decryption using hardcoded peer key.
        // It is not part of the Sapphire EVM.
        (bool success, bytes memory decryptedData) = DECODE.call(
            abi.encode(encryptedData
        ));
        assertEq(success, true);
        assertEq(
            decryptedData, 
            abi.encodeWithSelector(counter.increment.selector)
            );

        console.log("Counter number: ", counter.number());

        // counter contract inherits from SapphireDecryptor
        // Test if it handles the encrypted calldata correctly. 
        uint256 initialNumber = counter.number();
        (success, decryptedData) = address(counter).call(encryptedData);
        assertEq(success, true);
        assertEq(counter.number(), initialNumber + 1);
    }
}
