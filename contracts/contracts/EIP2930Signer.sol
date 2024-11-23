// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;
import {Sapphire} from "./Sapphire.sol";
import {EthereumUtils, SignatureRSV} from "./EthereumUtils.sol";
import {RLPWriter} from "./RLPWriter.sol";
import {EIPTypes} from "./EIPTypes.sol";

/**
 * @title Ethereum EIP-2930 transaction signer & encoder
 */
library EIP2930Signer {
    struct EIP2930Tx {
        uint64 nonce;
        uint256 gasPrice;
        uint64 gasLimit;
        address to;
        uint256 value;
        bytes data;
        EIPTypes.AccessList accessList;
        uint256 chainId;
    }

    /**
     * @notice Encode an unsigned EIP-2930 transaction for signing
     * @param rawTx Transaction to encode
     */
    function encodeUnsignedTx(EIP2930Tx memory rawTx)
        internal
        pure
        returns (bytes memory)
    {
        bytes[] memory b = new bytes[](8);
        b[0] = RLPWriter.writeUint(rawTx.chainId);
        b[1] = RLPWriter.writeUint(rawTx.nonce);
        b[2] = RLPWriter.writeUint(rawTx.gasPrice);
        b[3] = RLPWriter.writeUint(rawTx.gasLimit);
        b[4] = RLPWriter.writeAddress(rawTx.to);
        b[5] = RLPWriter.writeUint(rawTx.value);
        b[6] = RLPWriter.writeBytes(rawTx.data);
        b[7] = EIPTypes.encodeAccessList(rawTx.accessList);

        // RLP encode the transaction data
        bytes memory rlpEncodedTx = RLPWriter.writeList(b);

        // Return the unsigned transaction with EIP-2930 type prefix
        return abi.encodePacked(hex"01", rlpEncodedTx);
    }

    /**
     * @notice Encode a signed EIP-2930 transaction
     * @param rawTx Transaction which was signed
     * @param rsv R, S & V parameters of signature
     */
    function encodeSignedTx(EIP2930Tx memory rawTx, SignatureRSV memory rsv)
        internal
        pure
        returns (bytes memory)
    {
        bytes[] memory b = new bytes[](11);
        b[0] = RLPWriter.writeUint(rawTx.chainId);
        b[1] = RLPWriter.writeUint(rawTx.nonce);
        b[2] = RLPWriter.writeUint(rawTx.gasPrice);
        b[3] = RLPWriter.writeUint(rawTx.gasLimit);
        b[4] = RLPWriter.writeAddress(rawTx.to);
        b[5] = RLPWriter.writeUint(rawTx.value);
        b[6] = RLPWriter.writeBytes(rawTx.data);
        b[7] = EIPTypes.encodeAccessList(rawTx.accessList);
        b[8] = RLPWriter.writeUint(uint256(rsv.v));
        b[9] = RLPWriter.writeUint(uint256(rsv.r));
        b[10] = RLPWriter.writeUint(uint256(rsv.s));

        // RLP encode the transaction data
        bytes memory rlpEncodedTx = RLPWriter.writeList(b);

        // Return the signed transaction with EIP-2930 type prefix
        return abi.encodePacked(hex"01", rlpEncodedTx);
    }

    /**
     * @notice Sign a raw transaction
     * @param rawTx Transaction to sign
     * @param pubkeyAddr Ethereum address of secret key
     * @param secretKey Secret key used to sign
     */
    function signRawTx(
        EIP2930Tx memory rawTx,
        address pubkeyAddr,
        bytes32 secretKey
    ) internal view returns (SignatureRSV memory ret) {
        // First encode the transaction without signature fields
        bytes memory encoded = encodeUnsignedTx(rawTx);

        // Hash the encoded unsigned transaction
        bytes32 digest = keccak256(encoded);

        // Sign the hash
        ret = EthereumUtils.sign(pubkeyAddr, secretKey, digest);
    }

    /**
     * @notice Sign a transaction, returning it in EIP-2930 encoded form
     * @param publicAddress Ethereum address of secret key
     * @param secretKey Secret key used to sign
     * @param transaction Transaction to sign
     */
    function sign(
        address publicAddress,
        bytes32 secretKey,
        EIP2930Tx memory transaction
    ) internal view returns (bytes memory) {
        SignatureRSV memory rsv = signRawTx(
            transaction,
            publicAddress,
            secretKey
        );

        // For EIP-2930, we only need to normalize v to 0/1
        rsv.v = rsv.v - 27;

        return encodeSignedTx(transaction, rsv);
    }
}
