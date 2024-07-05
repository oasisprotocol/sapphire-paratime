// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../EthereumUtils.sol";

/**
 * @title Interface for authenticatable contracts
 * @notice The interface for universal authentication mechanism (e.g. SIWE and
 * others). First, the user-facing app should call login() to generate on-chain
 * bearer token. Then, the smart contract methods that require authentication
 * accept this token and pass it to authMsgSender() to verify it and obtain the
 * authenticated user address that can be used for the authorization.
 */
abstract contract A13e {
    /**
     * @notice Verify the login message and its signature and generate the bearer token.
     */
    function login(string calldata message, SignatureRSV calldata sig) external virtual view returns (bytes memory);

    /**
     * @notice Validate the bearer token and return authenticated msg.sender.
     */
    function authMsgSender(bytes calldata bearer) internal virtual view returns (address);
}
