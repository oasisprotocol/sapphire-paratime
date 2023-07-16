// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import {Sapphire} from "../Sapphire.sol";
import {EthereumUtils} from "../EthereumUtils.sol";

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

    function testEthereum(bytes memory seed, bytes32 digest)
        external
        view
        returns (
            address addr,
            bytes32 r,
            bytes32 s,
            uint8 v
        )
    {
        Sapphire.SigningAlg alg = Sapphire
            .SigningAlg
            .Secp256k1PrehashedKeccak256;

        (bytes memory pk, bytes memory sk) = Sapphire.generateSigningKeyPair(
            alg,
            seed
        );

        bytes memory sig = Sapphire.sign(alg, sk, abi.encodePacked(digest), "");

        (addr, r, s, v) = EthereumUtils.toEthereumSignature(pk, digest, sig);
    }
}
