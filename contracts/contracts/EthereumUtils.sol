// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import {Sapphire} from "./Sapphire.sol";

struct SignatureRSV {
    bytes32 r;
    bytes32 s;
    uint256 v;
}

library EthereumUtils {
    uint256 internal constant K256_P =
        0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f;

    // (p+1)//4
    uint256 internal constant K256_P_PLUS_1_OVER_4 =
        0x3fffffffffffffffffffffffffffffffffffffffffffffffffffffffbfffff0c;

    address internal constant PRECOMPILE_BIGMODEXP = address(0x5);

    error expmod_Error();

    function expmod(
        uint256 base,
        uint256 exponent,
        uint256 modulus
    ) internal view returns (uint256 out) {
        (bool success, bytes memory result) = PRECOMPILE_BIGMODEXP.staticcall(
            abi.encodePacked(
                uint256(0x20), // length of base
                uint256(0x20), // length of exponent
                uint256(0x20), // length of modulus
                base,
                exponent,
                modulus
            )
        );

        if (!success) revert expmod_Error();

        out = uint256(bytes32(result));
    }

    error k256DeriveY_Invalid_Prefix_Error();

    /**
     * Recover Y coordinate from X coordinate and sign bit
     * @param prefix 0x02 or 0x03 indicates sign bit of compressed point
     * @param x X coordinate
     */
    function k256DeriveY(uint8 prefix, uint256 x)
        internal
        view
        returns (uint256 y)
    {
        if (prefix != 0x02 && prefix != 0x03)
            revert k256DeriveY_Invalid_Prefix_Error();

        // x^3 + ax + b, where a=0, b=7
        y = addmod(mulmod(x, mulmod(x, x, K256_P), K256_P), 7, K256_P);

        // find square root of quadratic residue
        y = expmod(y, K256_P_PLUS_1_OVER_4, K256_P);

        // negate y if indicated by sign bit
        if ((y + prefix) % 2 != 0) {
            y = K256_P - y;
        }
    }

    error k256Decompress_Invalid_Length_Error();

    /**
     * Decompress SEC P256 k1 point
     * @param pk 33 byte compressed public key
     * @return x coordinate
     * @return y coordinate
     */
    function k256Decompress(bytes memory pk)
        internal
        view
        returns (uint256 x, uint256 y)
    {
        if (pk.length != 33) revert k256Decompress_Invalid_Length_Error();
        assembly {
            // skip 32 byte length prefix, plus one byte sign prefix
            x := mload(add(pk, 33))
        }
        y = k256DeriveY(uint8(pk[0]), x);
    }

    function k256PubkeyToEthereumAddress(bytes memory pubkey)
        internal
        view
        returns (address)
    {
        (uint256 x, uint256 y) = k256Decompress(pubkey);
        return toEthereumAddress(x, y);
    }

    /**
     * Convert SEC P256 k1 curve point to Ethereum address
     * @param x coordinate
     * @param y coordinate
     * @custom:see https://gavwood.com/paper.pdf (212)
     */
    function toEthereumAddress(uint256 x, uint256 y)
        internal
        pure
        returns (address)
    {
        bytes32 digest = keccak256(abi.encodePacked(x, y));

        return address(uint160((uint256(digest) << 96) >> 96));
    }

    error DER_Split_Error();

    /**
     * Extracts the `r` and `s` parameters from a DER encoded ECDSA signature.
     *
     * The signature is an ASN1 encoded SEQUENCE of the variable length `r` and `s` INTEGERs.
     *
     * | 0x30 | len(z) | 0x02 | len(r) |  r   | 0x02 | len(s) |  s   | = hex value
     * |  1   |   1    |   1  |   1    | 1-33 |  1   |   1    | 1-33 | = byte length
     *
     * If the highest bit of either `r` or `s` is set, it will be prefix padded with a zero byte
     * There is exponentially decreasing probability that either `r` or `s` will be below 32 bytes.
     * There is a very high probability that either `r` or `s` will be 33 bytes.
     * This function only works if either `r` or `s` are 256bits or lower.
     *
     * @param der DER encoded ECDSA signature
     * @return rsv ECDSA R point X coordinate, and S scalar
     * @custom:see https://bitcoin.stackexchange.com/questions/58853/how-do-you-figure-out-the-r-and-s-out-of-a-signature-using-python
     */
    function splitDERSignature(bytes memory der)
        internal
        pure
        returns (SignatureRSV memory rsv)
    {
        if (der.length < 8) revert DER_Split_Error();
        if (der[0] != 0x30) revert DER_Split_Error();
        if (der[2] != 0x02) revert DER_Split_Error();

        uint256 zLen = uint8(der[1]);
        uint256 rLen = uint8(der[3]);
        if (rLen > 33) revert DER_Split_Error();

        uint256 sOffset = 4 + rLen;
        uint256 sLen = uint8(der[sOffset + 1]);
        if (sLen > 33) revert DER_Split_Error();
        if (der[sOffset] != 0x02) revert DER_Split_Error();

        if (rLen + sLen + 4 != zLen) revert DER_Split_Error();
        if (der.length != zLen + 2) revert DER_Split_Error();

        sOffset += 2;
        uint256 rOffset = 4;

        if (rLen == 33) {
            if (der[4] != 0x00) revert DER_Split_Error();
            rOffset += 1;
            rLen -= 1;
        }

        if (sLen == 33) {
            if (der[sOffset] != 0x00) revert DER_Split_Error();
            sOffset += 1;
            sLen -= 1;
        }

        bytes32 r;
        bytes32 s;

        assembly {
            r := mload(add(der, add(32, rOffset)))
            s := mload(add(der, add(32, sOffset)))
        }

        // When length of either `r` or `s` is below 32 bytes
        // the 32 byte `mload` will suffix it with unknown stuff
        // shift right to remove the unknown stuff, prefixing with zeros instead

        if (rLen < 32) {
            r >>= 8 * (32 - rLen);
        }

        if (sLen < 32) {
            s >>= 8 * (32 - sLen);
        }

        rsv.r = r;
        rsv.s = s;
    }

    error recoverV_Error();

    function recoverV(
        address pubkeyAddr,
        bytes32 digest,
        SignatureRSV memory rsv
    ) internal pure {
        rsv.v = 27;

        if (ecrecover(digest, uint8(rsv.v), rsv.r, rsv.s) != pubkeyAddr) {
            rsv.v = 28;

            if (ecrecover(digest, uint8(rsv.v), rsv.r, rsv.s) != pubkeyAddr) {
                revert recoverV_Error();
            }
        }
    }

    /**
     * Convert a Secp256k1PrehashedKeccak256 signature to one accepted by ecrecover
     * @param pubkey 33 byte compressed public key
     * @param digest 32 byte pre-hashed message digest
     * @param signature ASN.1 DER encoded signature, as returned from `Sapphire.sign`
     * @return pubkeyAddr 20 byte Ethereum address
     * @return rsv Ethereum EcDSA RSV signature values
     * @custom:see https://gavwood.com/paper.pdf (206)
     */
    function toEthereumSignature(
        bytes memory pubkey,
        bytes32 digest,
        bytes memory signature
    ) internal view returns (address pubkeyAddr, SignatureRSV memory rsv) {
        pubkeyAddr = k256PubkeyToEthereumAddress(pubkey);

        rsv = splitDERSignature(signature);

        recoverV(pubkeyAddr, digest, rsv);
    }

    function sign(
        address pubkeyAddr,
        bytes32 secretKey,
        bytes32 digest
    ) internal view returns (SignatureRSV memory rsv) {
        bytes memory signature = Sapphire.sign(
            Sapphire.SigningAlg.Secp256k1PrehashedKeccak256,
            abi.encodePacked(secretKey),
            abi.encodePacked(digest),
            ""
        );

        rsv = splitDERSignature(signature);

        recoverV(pubkeyAddr, digest, rsv);
    }

    /**
     * Generates an Ethereum compatible SEC P256 k1 keypair and corresponding public address
     * @return pubkeyAddr Ethereum address
     * @return secretKey Secret key used for signing
     */
    function generateKeypair()
        internal
        view
        returns (address pubkeyAddr, bytes32 secretKey)
    {
        bytes memory randSeed = Sapphire.randomBytes(32, "");

        secretKey = bytes32(randSeed);

        (bytes memory pk, bytes memory tmp) = Sapphire.generateSigningKeyPair(
            Sapphire.SigningAlg.Secp256k1PrehashedKeccak256,
            randSeed
        );

        pubkeyAddr = k256PubkeyToEthereumAddress(pk);
    }
}
