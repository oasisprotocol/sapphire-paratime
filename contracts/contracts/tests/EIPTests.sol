// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {EthereumUtils} from "../EthereumUtils.sol";
import {EIP1559Signer} from "../EIP1559Signer.sol";
import {EIP2930Signer} from "../EIP2930Signer.sol";

contract EIPTests {
    address public immutable SENDER_ADDRESS;
    bytes32 public immutable SECRET_KEY;

    // New state variables to simulate storage access
    uint256 public storedNumber1;
    uint256 public storedNumber2;
    bytes32 public storedBytes1;
    bytes32 public storedBytes2;

    constructor() payable {
        // Deploy test contract
        (SENDER_ADDRESS, SECRET_KEY) = EthereumUtils.generateKeypair();
        payable(SENDER_ADDRESS).transfer(msg.value);
        
        // Initialize state variables
        storedNumber1 = 42;
        storedNumber2 = 84;
        storedBytes1 = keccak256(abi.encodePacked("first slot"));
        storedBytes2 = keccak256(abi.encodePacked("second slot"));
    }

    function getChainId() external view returns (uint256) {
        return block.chainid;
    }

    event HasChainId(uint256);
    function emitChainId() external {
        emit HasChainId(block.chainid);
    }

    // In your contract
    function getStorageSlots() public pure returns (bytes32, bytes32, bytes32, bytes32) {
        bytes32 slot0;
        bytes32 slot1;
        bytes32 slot2;
        bytes32 slot3;
        
        assembly {
            // Get storage slots for each state variable
            // Note: immutable variables don't have storage slots
            slot0 := storedNumber1.slot  // uint256 public storedNumber1
            slot1 := storedNumber2.slot  // uint256 public storedNumber2
            slot2 := storedBytes1.slot   // bytes32 public storedBytes1
            slot3 := storedBytes2.slot   // bytes32 public storedBytes2
        }
        
        return (slot0, slot1, slot2, slot3);
    }

    // EIP-1559 signing functions
    function signEIP1559(EIP1559Signer.EIP1559Tx memory transaction)
        external
        view
        returns (bytes memory)
    {
        transaction.data = abi.encodeWithSelector(this.example.selector);
        transaction.chainId = block.chainid;
        return EIP1559Signer.sign(SENDER_ADDRESS, SECRET_KEY, transaction);
    }

    function signEIP1559WithSecret(
        EIP1559Signer.EIP1559Tx memory transaction,
        address fromPublicAddr,
        bytes32 fromSecret
    ) external view returns (bytes memory) {
        transaction.data = abi.encodeWithSelector(this.example.selector);
        transaction.chainId = block.chainid;
        return EIP1559Signer.sign(fromPublicAddr, fromSecret, transaction);
    }

    // EIP-2930 signing functions
    function signEIP2930(EIP2930Signer.EIP2930Tx memory transaction)
        external
        view
        returns (bytes memory)
    {
        transaction.data = abi.encodeWithSelector(this.example.selector);
        transaction.chainId = block.chainid;
        return EIP2930Signer.sign(SENDER_ADDRESS, SECRET_KEY, transaction);
    }

    function signEIP2930WithSecret(
        EIP2930Signer.EIP2930Tx memory transaction,
        address fromPublicAddr,
        bytes32 fromSecret
    ) external view returns (bytes memory) {
        transaction.data = abi.encodeWithSelector(this.example.selector);
        transaction.chainId = block.chainid;
        return EIP2930Signer.sign(fromPublicAddr, fromSecret, transaction);
    }

    event ExampleEvent(bytes32 x);
    function example() external returns (uint256 result) {
        emit ExampleEvent(
            0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210
        );
        // First access to storage variables (cold access without access list)
        uint256 sum1 = storedNumber1 + storedNumber2;
        bytes32 hash1 = keccak256(abi.encodePacked(storedBytes1, storedBytes2));
        emit ExampleEvent(hash1);

        // Second access (would be cold again without access list)
        uint256 sum2 = storedNumber1 * storedNumber2;
        bytes32 hash2 = keccak256(abi.encodePacked(storedBytes2, storedBytes1));
        emit ExampleEvent(hash2);

        // Third access (cold again without access list)
        uint256 sum3 = (storedNumber1 ** 2) + (storedNumber2 ** 2);
        bytes32 hash3 = keccak256(abi.encodePacked(storedBytes1, storedBytes2));
        emit ExampleEvent(hash3);

        // Use all computed values to prevent optimization
        result = sum1 + sum2 + uint256(hash1) + uint256(hash2) + uint256(hash3) + sum3;
    }
}