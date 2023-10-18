// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import {EthereumUtils} from "../EthereumUtils.sol";
import {EIP155Signer} from "../EIP155Signer.sol";

contract EIP155Tests {
    address public immutable publicAddr;
    bytes32 public immutable secretKey;

    constructor() payable {
        (publicAddr, secretKey) = EthereumUtils.generateKeypair();
        payable(publicAddr).transfer(msg.value);
    }

    function getChainId() external view returns (uint256) {
        return block.chainid;
    }

    event HasChainId(uint256);

    function emitChainId() external {
        emit HasChainId(block.chainid);
    }

    function sign(EIP155Signer.EthTx memory transaction)
        external
        view
        returns (bytes memory)
    {
        transaction.data = abi.encodeWithSelector(this.example.selector);
        transaction.chainId = block.chainid;
        return EIP155Signer.sign(publicAddr, secretKey, transaction);
    }

    function signWithSecret(
        EIP155Signer.EthTx memory transaction,
        address fromPublicAddr,
        bytes32 fromSecret
    ) external view returns (bytes memory) {
        transaction.data = abi.encodeWithSelector(this.example.selector);
        transaction.chainId = block.chainid;
        return EIP155Signer.sign(fromPublicAddr, fromSecret, transaction);
    }

    event ExampleEvent(bytes32 x);

    function example() external {
        emit ExampleEvent(
            0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210
        );
    }
}
