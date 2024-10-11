// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import { Sapphire } from "../Sapphire.sol";
import { CalldataEncryption } from "../CalldataEncryption.sol";

contract TestCalldataEncryption {
    function testEncryptInner(
        bytes memory in_data,
        Sapphire.Curve25519PublicKey myPublic,
        Sapphire.Curve25519SecretKey mySecret,
        bytes15 nonce,
        uint epoch,
        bytes32 peerPublicKey
    ) external view returns (bytes memory) {
        return CalldataEncryption.encryptCallData(in_data, myPublic, mySecret, nonce, epoch, peerPublicKey);
    }
}
