// SPDX-License-Identifier: CC-PDDC

pragma solidity ^0.8.0;

import "../Sapphire.sol";

contract SigningTests {
    function testKeygen(Sapphire.SigningAlg alg, bytes memory seed)
        external
        view
        returns (bytes memory publicKey, bytes memory secretKey)
    {
        return Sapphire.generateSigningKeyPair(alg, seed);
    }

    function testSign(
        Sapphire.SigningAlg alg,
        bytes memory secretKey,
        bytes memory contextOrHash,
        bytes memory message
    ) external view returns (bytes memory signature) {
        return Sapphire.sign(alg, secretKey, contextOrHash, message);
    }

    function testVerify(
        Sapphire.SigningAlg alg,
        bytes memory publicKey,
        bytes memory contextOrHash,
        bytes memory message,
        bytes memory signature
    ) external view returns (bool verified) {
        return
            Sapphire.verify(alg, publicKey, contextOrHash, message, signature);
    }
}
