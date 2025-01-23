// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import {console} from "forge-std/console.sol";
import "../src/BaseSapphireTest.sol";

contract Safe {
    receive() external payable {}

    function withdraw() external {
        payable(msg.sender).transfer(address(this).balance);
    }
}

contract CalldataEncryptionTest is SapphireTest {
    Safe safe;

    receive() external payable {}
    
    function setUp() public override {
        super.setUp(); // Call parent setUp first
        safe = new Safe();
    }

    function testFuzz_Withdraw(uint96 amount) public {
        console.log("Contract balance: ", address(this).balance);
        payable(address(safe)).transfer(amount);
        uint256 preBalance = address(this).balance;
        safe.withdraw();
        uint256 postBalance = address(this).balance;
        assertEq(preBalance + amount, postBalance);
    }

    function testEncryptCallDataFuzz(bytes15 nonce) public {
        bytes memory in_data = bytes("Hello, Sapphire!");

        Sapphire.Curve25519PublicKey myPublic;
        Sapphire.Curve25519SecretKey mySecret;

        (myPublic, mySecret) = Sapphire.generateCurve25519KeyPair("");

        // bytes15 nonce = bytes15(Sapphire.randomBytes(15, ""));

        Subcall.CallDataPublicKey memory cdpk;
        uint256 epoch;

        (epoch, cdpk) = Subcall.coreCallDataPublicKey();
        bytes memory result = testCalldataEncryption.testEncryptCallData(
            in_data,
            myPublic,
            mySecret,
            nonce,
            epoch,
            cdpk.key
        );
        (bool success, bytes memory decrypted) = address(bytes20(keccak256(bytes("0x987654321098765432109876543210")))).call(abi.encode(result));
        assertEq(success, true);
        assertEq(decrypted, in_data);
    }


    function testEncryptCallData() public {
        bytes memory in_data = bytes("Hello, Sapphire!");

        Sapphire.Curve25519PublicKey myPublic;
        Sapphire.Curve25519SecretKey mySecret;

        (myPublic, mySecret) = Sapphire.generateCurve25519KeyPair("");

        bytes15 nonce = bytes15(Sapphire.randomBytes(15, ""));

        Subcall.CallDataPublicKey memory cdpk;
        uint256 epoch;

        (epoch, cdpk) = Subcall.coreCallDataPublicKey();
        bytes memory result = testCalldataEncryption.testEncryptCallData(
            in_data,
            myPublic,
            mySecret,
            nonce,
            epoch,
            cdpk.key
        );
        (bool success, bytes memory decrypted) = address(bytes20(keccak256(bytes("0x987654321098765432109876543210")))).call(abi.encode(result));
        assertEq(success, true);
        assertEq(decrypted, in_data);
    }

    function testCounterEncryptCallData() public {
        bytes memory encryptedData = encryptCallData(abi.encodeWithSelector(counter.increment.selector));
        (bool success, bytes memory decryptedData) = address(bytes20(keccak256(bytes("0x987654321098765432109876543210")))).call(abi.encode(encryptedData));
        assertEq(success, true);
        assertEq(decryptedData, abi.encodeWithSelector(counter.increment.selector));

        console.log("Counter number: ", counter.number());
        uint256 initialNumber = counter.number();
        (success, decryptedData) = address(counter).call(encryptedData);
        assertEq(success, true);
        assertEq(counter.number(), initialNumber + 1);
    }
}
