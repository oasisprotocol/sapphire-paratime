// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {Sapphire} from "./Sapphire.sol";
import {EthereumUtils, SignatureRSV} from "./EthereumUtils.sol";
import {RLPWriter} from "./RLPWriter.sol";

/**
 * @title Ethereum EIP-155 compatible transaction signer & encoder
 */
library EIP155Signer {
    struct EthTx {
        uint64 nonce;
        uint256 gasPrice;
        uint64 gasLimit;
        address to;
        uint256 value;
        bytes data;
        uint256 chainId;
    }

    /**
     * Encode a signed EIP-155 transaction
     * @param rawTx Transaction which was signed
     * @param rsv R, S & V parameters of signature
     */
    function encodeSignedTx(EthTx memory rawTx, SignatureRSV memory rsv)
        internal
        pure
        returns (bytes memory)
    {
        bytes[] memory b = new bytes[](9);
        b[0] = RLPWriter.writeUint(rawTx.nonce);
        b[1] = RLPWriter.writeUint(rawTx.gasPrice);
        b[2] = RLPWriter.writeUint(rawTx.gasLimit);
        b[3] = RLPWriter.writeAddress(rawTx.to);
        b[4] = RLPWriter.writeUint(rawTx.value);
        b[5] = RLPWriter.writeBytes(rawTx.data);
        b[6] = RLPWriter.writeUint(rsv.v);
        b[7] = RLPWriter.writeUint(uint256(rsv.r));
        b[8] = RLPWriter.writeUint(uint256(rsv.s));
        return RLPWriter.writeList(b);
    }

    /**
     * Sign a raw transaction, which will then need to be encoded to include the signature
     * @param rawTx Transaction to sign
     * @param pubkeyAddr Ethereum address of secret key
     * @param secretKey Secret key used to sign
     */
    function signRawTx(
        EthTx memory rawTx,
        address pubkeyAddr,
        bytes32 secretKey
    ) internal view returns (SignatureRSV memory ret) {
        bytes memory encoded = encodeSignedTx(
            rawTx,
            SignatureRSV({v: rawTx.chainId, r: 0, s: 0})
        );

        bytes32 digest = keccak256(abi.encodePacked(encoded));

        ret = EthereumUtils.sign(pubkeyAddr, secretKey, digest);
    }

    /**
     * Sign a transaction, returning it in EIP-155 encoded form
     * @param publicAddress Ethereum address of secret key
     * @param secretKey Secret key used to sign
     * @param transaction Transaction to sign
     */
    function sign(
        address publicAddress,
        bytes32 secretKey,
        EthTx memory transaction
    ) internal view returns (bytes memory) {
        SignatureRSV memory rsv = signRawTx(
            transaction,
            publicAddress,
            secretKey
        );
        rsv.v = (rsv.v - 27) + (transaction.chainId * 2) + 35;
        return encodeSignedTx(transaction, rsv);
    }
}
