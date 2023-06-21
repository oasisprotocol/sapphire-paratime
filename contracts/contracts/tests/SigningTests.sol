// SPDX-License-Identifier: CC-PDDC

pragma solidity ^0.8.0;

import "../Sapphire.sol";

contract SigningTests {
    function sign_k1_k256()
        external view
        returns (bool)
    {
        bytes memory seed = Sapphire.randomBytes(32, "");
        Sapphire.SigningAlg alg = Sapphire.SigningAlg.Secp256k1PrehashedKeccak256;
        (bytes memory publicKey, bytes memory secretKey) = Sapphire.generateSigningKeyPair(alg, seed);

        bytes memory random_message = Sapphire.randomBytes(128, "");
        bytes32 digest = keccak256(random_message);

        bytes memory signature = Sapphire.sign(alg, secretKey, abi.encodePacked(digest), "");

        bool success = Sapphire.verify(alg, publicKey, abi.encodePacked(digest), "", signature);

        return success;
    }

    function sign_k1_s256()
        external view
        returns (bool)
    {
        bytes memory seed = Sapphire.randomBytes(32, "");
        Sapphire.SigningAlg alg = Sapphire.SigningAlg.Secp256k1PrehashedSha256;
        (bytes memory publicKey, bytes memory secretKey) = Sapphire.generateSigningKeyPair(alg, seed);

        bytes memory random_message = Sapphire.randomBytes(128, "");
        bytes32 digest = sha256(random_message);

        bytes memory signature = Sapphire.sign(alg, secretKey, abi.encodePacked(digest), "");

        bool success = Sapphire.verify(alg, publicKey, abi.encodePacked(digest), "", signature);

        return success;
    }

    function test_keygen(
        Sapphire.SigningAlg alg,
        bytes memory seed
    )
        external view
        returns (bytes memory publicKey, bytes memory secretKey)
    {
        return Sapphire.generateSigningKeyPair(alg, seed);
    }

    function test_sign(
        Sapphire.SigningAlg alg,
        bytes memory secretKey,
        bytes memory contextOrHash,
        bytes memory message
    )
        external view
        returns (bytes memory signature)
    {
        return Sapphire.sign(alg, secretKey, contextOrHash, message);
    }

    function test_verify(
        Sapphire.SigningAlg alg,
        bytes memory publicKey,
        bytes memory contextOrHash,
        bytes memory message,
        bytes memory signature
    )
        external view
        returns (bool verified)
    {
        return Sapphire.verify(alg, publicKey, contextOrHash, message, signature);
    }
}
