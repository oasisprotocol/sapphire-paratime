// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import { Sapphire } from "../Sapphire.sol";
import { encryptCallData } from "../CalldataEncryption.sol";
import { EIP155Signer } from "../EIP155Signer.sol";

contract TestCalldataEncryption {
    function testEncryptCallData(
        bytes memory in_data,
        Sapphire.Curve25519PublicKey myPublic,
        Sapphire.Curve25519SecretKey mySecret,
        bytes15 nonce,
        uint256 epoch,
        bytes32 peerPublicKey
    ) external view returns (bytes memory) {
        return encryptCallData(in_data, myPublic, mySecret, nonce, epoch, peerPublicKey);
    }

    function makeExampleCall(
        bytes calldata in_data,
        uint64 nonce,
        uint256 gasPrice,
        uint64 gasLimit,
        address myAddr,
        bytes32 myKey
    )
        external view
        returns (bytes memory)
    {
        EIP155Signer.EthTx memory theTx = EIP155Signer.EthTx({
            nonce: nonce,
            gasPrice: gasPrice,
            gasLimit: gasLimit,
            value: 0,
            to: address(this),
            chainId: block.chainid,
            data: encryptCallData(abi.encodeCall(this.example, in_data))
        });

        return EIP155Signer.sign(myAddr, myKey, theTx);
    }

    event ExampleEvent(bytes);

    function example(bytes calldata in_calldata)
        external
    {
        emit ExampleEvent(in_calldata);
    }
}
