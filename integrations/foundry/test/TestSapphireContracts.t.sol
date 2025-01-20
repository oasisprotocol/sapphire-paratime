// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import {console} from "forge-std/console.sol";
import "lib/oasisprotocol-sapphire-foundry/BaseSapphireTest.sol";
import "lib/oasisprotocol-sapphire-contracts/CalldataEncryption.sol";


contract CalldataEncryptionTest is SapphireTest {
    
    function setUp() public override {
        super.setUp(); // Call parent setUp first
    }
    
    /*
    Test encryption using Sapphire Contracts.  
    */  
    function testEncryptCallData() public {
        bytes memory in_data = bytes("Hello, Sapphire!");

        Sapphire.Curve25519PublicKey myPublic;
        Sapphire.Curve25519SecretKey mySecret;

        (myPublic, mySecret) = Sapphire.generateCurve25519KeyPair("");

        bytes15 nonce = bytes15(Sapphire.randomBytes(15, ""));

        Subcall.CallDataPublicKey memory cdpk;
        uint256 epoch;

        (epoch, cdpk) = Subcall.coreCallDataPublicKey();
        bytes memory result = encryptCallData(
            in_data,
            myPublic,
            mySecret,
            nonce,
            epoch,
            cdpk.key
        );
        // DECODE is used for 
        // testing decryption using hardcoded peer public key.
        // It is not part of the Sapphire EVM.
        (bool success, bytes memory decrypted) = DECODE.call(abi.encode(result));
        assertEq(success, true);
        assertEq(decrypted, in_data);
    }
    
    /*
    Fuzz tests for the CalldataEncryption contract.
    Foundry automatically generates nonces for fuzz tests.
    */  
    function testEncryptCallDataFuzz(bytes15 nonce) public {
        bytes memory in_data = bytes("Hello, Sapphire!");

        Sapphire.Curve25519PublicKey myPublic;
        Sapphire.Curve25519SecretKey mySecret;

        (myPublic, mySecret) = Sapphire.generateCurve25519KeyPair("");

        Subcall.CallDataPublicKey memory cdpk;
        uint256 epoch;

        (epoch, cdpk) = Subcall.coreCallDataPublicKey();
        bytes memory result = encryptCallData(
            in_data,
            myPublic,
            mySecret,
            nonce,
            epoch,
            cdpk.key
        );
        // DECODE is used for 
        // testing decryption using hardcoded peer key.
        // It is not part of the Sapphire EVM.
        (bool success, bytes memory decrypted) = DECODE.call(abi.encode(result));
        assertEq(success, true);
        assertEq(decrypted, in_data);
    }
}
