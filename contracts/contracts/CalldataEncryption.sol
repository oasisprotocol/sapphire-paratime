// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import {Subcall} from "./Subcall.sol";
import {Sapphire} from "./Sapphire.sol";
import "./CBOR.sol" as CBOR;

function _deriveKey(
    bytes32 in_peerPublicKey,
    Sapphire.Curve25519SecretKey in_x25519_secret
) view returns (bytes32) {
    return
        Sapphire.deriveSymmetricKey(
            Sapphire.Curve25519PublicKey.wrap(in_peerPublicKey),
            in_x25519_secret
        );
}

function _encryptInner(
    bytes memory in_data,
    Sapphire.Curve25519SecretKey in_x25519_secret,
    bytes15 nonce,
    bytes32 peerPublicKey
) view returns (bytes memory out_encrypted) {
    bytes memory plaintextEnvelope = abi.encodePacked(
        hex"a1", // map(1)
        hex"64", //     text(4) "body"
        "body",
        CBOR.encodeBytes(in_data)
    );

    out_encrypted = Sapphire.encrypt(
        _deriveKey(peerPublicKey, in_x25519_secret),
        nonce,
        plaintextEnvelope,
        ""
    );
}

function encryptCallData(bytes memory in_data)
    view
    returns (bytes memory out_encrypted)
{
    if (in_data.length == 0) {
        return "";
    }

    Sapphire.Curve25519PublicKey myPublic;
    Sapphire.Curve25519SecretKey mySecret;

    (myPublic, mySecret) = Sapphire.generateCurve25519KeyPair("");

    bytes15 nonce = bytes15(Sapphire.randomBytes(15, ""));

    Subcall.CallDataPublicKey memory cdpk;
    uint256 epoch;

    (epoch, cdpk) = Subcall.coreCallDataPublicKey();

    return encryptCallData(in_data, myPublic, mySecret, nonce, epoch, cdpk.key);
}

function encryptCallData(
    bytes memory in_data,
    Sapphire.Curve25519PublicKey myPublic,
    Sapphire.Curve25519SecretKey mySecret,
    bytes15 nonce,
    uint256 epoch,
    bytes32 peerPublicKey
) view returns (bytes memory out_encrypted) {
    if (in_data.length == 0) {
        return "";
    }

    bytes memory inner = _encryptInner(in_data, mySecret, nonce, peerPublicKey);

    return
        abi.encodePacked(
            hex"a2", //  map(2)
            hex"64", //      text(4) "body"
            "body",
            hex"a4", //          map(4)
            hex"62", //              text(2) "pk"
            "pk",
            hex"5820", //                 bytes(32)
            myPublic,
            hex"64", //              text(4) "data"
            "data",
            CBOR.encodeBytes(inner), //     bytes(n) inner
            hex"65", //              text(5) "epoch"
            "epoch",
            CBOR.encodeUint(epoch), //      unsigned(epoch)
            hex"65", //              text(5) "nonce"
            "nonce",
            hex"4f", //                  bytes(15) nonce
            nonce,
            hex"66", //      text(6) "format"
            "format",
            hex"01" //      unsigned(1)
        );
}
