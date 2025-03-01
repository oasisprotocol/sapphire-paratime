// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import {console} from "forge-std/console.sol";
import "lib/oasisprotocol-sapphire-foundry/BaseSapphireTest.sol";

contract PrecompileTest is SapphireTest {
    
    function setUp() public override {
        super.setUp();
    }
    

    function testRandomBytes() public {
        // Modify input data encoding - separate the length and string parameters
        bytes memory inputData = abi.encode(
            uint(32),  // length of random bytes requested
            bytes("test")  // additional entropy
        );

        // Direct low-level call
        (bool success, bytes memory result) = RANDOM_BYTES.call(inputData);
        bytes memory randomBytes = result;
        console.log("Hex result: 0x%s", vm.toString(randomBytes));
        assertTrue(success, "Direct call failed");
        assertEq(randomBytes.length, 32, "Incorrect result length");
        
        // Test second call gives different result
        (bool success2, bytes memory result2) = RANDOM_BYTES.call(inputData);
        assertTrue(success2, "Second direct call failed");
        assertNotEq(keccak256(result2), keccak256(result), "Results should be different");

        (bool success_static, bytes memory result_static) = RANDOM_BYTES.staticcall(inputData);
        bytes memory randomBytes_static = result_static;
        console.log("Hex result staticcall: 0x%s", vm.toString(randomBytes_static));
        assertTrue(success_static, "Direct call failed");
        assertEq(randomBytes_static.length, 32, "Incorrect result length");
        assertNotEq(keccak256(result_static), keccak256(result), "Results should be different");
    }

    function testX25519Derive() public {
        // Test vectors from Oasis core 
        bytes32 publicKey = bytes32(hex"3046db3fa70ce605457dc47c48837ebd8bd0a26abfde5994d033e1ced68e2576");
        bytes32 privateKey = bytes32(hex"c07b151fbc1e7a11dff926111188f8d872f62eba0396da97c0a24adb75161750");
        bytes memory expectedOutput = hex"e69ac21066a8c2284e8fdc690e579af4513547b9b31dd144792c1904b45cf586";

        bytes memory inputData = abi.encodePacked(publicKey, privateKey);

        // Direct call
        (bool success, bytes memory result) = X25519_DERIVE.call(inputData);
        assertTrue(success, "Direct call failed");
        assertEq(result, expectedOutput, "Incorrect derived key");

        // Static call
        (bool successStatic, bytes memory resultStatic) = X25519_DERIVE.staticcall(inputData);
        assertTrue(successStatic, "Static call failed");
        assertEq(resultStatic, expectedOutput, "Incorrect derived key from static call");
    }

    function testCurve25519ComputePublic() public {
        bytes32 privateKey = bytes32(hex"000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
        bytes32 expectedPublic = bytes32(hex"8f40c5adb68f25624ae5b214ea767a6ec94d829d3d7b5e1ad1ba6f3e2138285f");

        (bool success, bytes memory result) = CURVE25519_COMPUTE_PUBLIC.call(abi.encodePacked(privateKey));
        assertTrue(success, "Direct call failed");
        assertEq(result, abi.encodePacked(expectedPublic), "Incorrect public key");

        (bool successStatic, bytes memory resultStatic) = CURVE25519_COMPUTE_PUBLIC.staticcall(abi.encodePacked(privateKey));
        assertTrue(successStatic, "Static call failed");
        assertEq(resultStatic, abi.encodePacked(expectedPublic), "Incorrect public key from static call");

    }

    function testDeoxysiiSealAndOpen() public {
        bytes32 key = bytes32("this must be the excelentest key");
        bytes32 nonce = bytes32("complete noncence, and too long.");
        bytes memory plaintext = bytes("test message");
        bytes memory ad = bytes("additional data");

        // Test seal
        (bool success, bytes memory encrypted_data) = DEOXYSII_SEAL.call(abi.encode(key, nonce, plaintext, ad));
        assertTrue(success, "Seal call failed");
        assertNotEq(encrypted_data, plaintext, "Sealed should differ from plaintext");

        // Test open
        (bool successOpen, bytes memory opened) = DEOXYSII_OPEN.call(abi.encode(key, nonce, encrypted_data, ad));
        assertTrue(successOpen, "Open call failed");
        
        // Log results
        console.log("Encrypted data:", string(encrypted_data));
        console.log("Opened data:", string(opened));
        assertEq(opened, plaintext, "Opened should match original plaintext");
    }

    function testKeypairGenerateAndSign() public {
        uint256 sigType = 0; // Ed25519_Oasis
        bytes memory seed = hex"3031323334353637383930313233343536373839303132333435363738393031";
        bytes memory message = bytes("test message");
        bytes memory context = bytes("test context");

        // Generate keypair
        (bool success, bytes memory result) = KEYPAIR_GENERATE.call(abi.encode(sigType, seed));
        assertTrue(success, "Keypair generation failed");

        (bytes memory publicKey, bytes memory privateKey) = abi.decode(result, (bytes, bytes));        

        // Sign message
        (bool successSign, bytes memory signResult) = SIGN.call(
            abi.encode(sigType, privateKey, context, message)
        );
        assertTrue(successSign, "Signing failed");

        // Get signature bytes - don't re-encode
        bytes memory signature = signResult;

        (bool successVerify, bytes memory verifyResult) = VERIFY.call(
            abi.encode(
                sigType,          // uint256
                publicKey,        // bytes - just the raw public key
                context,          // bytes
                message,         // bytes 
                signature        // bytes - just the raw signature
            )
        );
        bool verified = abi.decode(verifyResult, (bool));
        assertTrue(verified, "Signature verification failed");
    }

    function testSymmetricKeyGeneration() public {
        uint256 sigType = 0; // Ed25519_Oasis
        // Different seeds should generate different key pairs
        bytes memory seed1 = hex"3031323334353637383930313233343536373839303132333435363738393031";
        bytes memory seed2 = hex"3031323334353637383930313233343536373839303132333435363738393032";
        // Generate two key pairs
        (bool success1, bytes memory result1) = KEYPAIR_GENERATE.call(abi.encode(sigType, seed1));
        assertTrue(success1, "Keypair generation failed");
        (bytes memory publicKey1, bytes memory privateKey1) = abi.decode(result1, (bytes, bytes));

        (bool success2, bytes memory result2) = KEYPAIR_GENERATE.call(abi.encode(sigType, seed2));
        assertTrue(success2, "Keypair generation failed");
        (bytes memory publicKey2, bytes memory privateKey2) = abi.decode(result2, (bytes, bytes));

        // Derive symmetric keys
        (bool success3, bytes memory symmetricKey1) = X25519_DERIVE.call(abi.encode(publicKey1, privateKey2));
        assertTrue(success3, "Derive symmetric key failed");

        (bool success4, bytes memory symmetricKey2) = X25519_DERIVE.call(abi.encode(publicKey2, privateKey1));
        assertTrue(success4, "Derive symmetric key failed");

        // Assert the symmetric keys are equal
        assertEq(symmetricKey1, symmetricKey2, "Symmetric keys should be equal");
    }
    
    function testSubcallCoreCallDataPublicKey() public {
        // Test direct subcall to core.CallDataPublicKey
        (bool success, bytes memory result) = SUBCALL.call(
            abi.encode(
                "core.CallDataPublicKey",
                hex"f6" // null CBOR input
            )
        );
        assertTrue(success, "Direct subcall failed");
        console.logBytes(result);
        // Decode result
        (uint64 status, bytes memory data) = abi.decode(result, (uint64, bytes));        
    }
}
