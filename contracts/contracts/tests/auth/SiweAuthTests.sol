// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {EthereumUtils, SignatureRSV} from "../../EthereumUtils.sol";
import {SiweAuth} from "../../auth/SiweAuth.sol";

contract SiweAuthTests is SiweAuth {
    address private _owner;

    constructor(string memory domain) SiweAuth(domain) {
        _owner = msg.sender;
    }

    function setDomain(string memory inDomain) external {
        if (msg.sender==_owner) {
            _domain = inDomain;
        }
    }

    function testVerySecretMessage(bytes calldata token)
        external
        view
        returns (string memory)
    {
        if (authMsgSender(token) != _owner) {
            revert("not allowed");
        }
        return "Very secret message";
    }

    function testLogin(string calldata message, SignatureRSV calldata sig)
        external
        view
        returns (bytes memory)
    {
        return this.login(message, sig);
    }

    function testAuthMsgSender(bytes calldata token)
        external
        view
        returns (address)
    {
        return authMsgSender(token);
    }

    function testRevokeAuthToken(bytes32 token) external {
        return revokeAuthToken(token);
    }

    /**
     * @notice Test function to retrieve the statement from a token
     * @param token The authentication token to extract the statement from
     * @return The statement string from the SIWE message
     */
    function testGetStatement(bytes calldata token) 
        external 
        view 
        returns (string memory) 
    {
        return getStatement(token);
    }
    
    /**
     * @notice Test function to retrieve all resources from a token
     * @param token The authentication token to extract resources from
     * @return Array of resource URIs the token grants access to
     */
    function testGetResources(bytes calldata token) 
        external 
        view 
        returns (string[] memory) 
    {
        return getResources(token);
    }
    
    /**
     * @notice Test function that requires a specific statement
     * @param token The authentication token
     * @param expectedStatement The statement that is expected in the token
     * @return A success message if the statement matches
     */
    function testStatementVerification(bytes calldata token, string calldata expectedStatement) 
        external 
        view 
        returns (bool) 
    {
        string memory actualStatement = getStatement(token);
        if (keccak256(bytes(actualStatement)) == keccak256(bytes(expectedStatement))) {
            return true;
        }
        return false;
    }
   
    /**
     * @notice Test function to check if a token grants access to a specific resource
     * @param token The authentication token to check
     * @param resource The resource URI to check access for
     * @return True if the token grants access to the specified resource
     */
    function testHasResourceAccess(bytes calldata token, string calldata resource) 
        external 
        view 
        returns (bool) 
    {
        string[] memory tokenResources = getResources(token);
        for (uint256 i = 0; i < tokenResources.length; i++) {
            if (keccak256(bytes(tokenResources[i])) == keccak256(bytes(resource))) {
                return true;
            }
        }
        return false;
    }

    function doNothing() external { // solhint-disable-line
        // Does nothing
    }
}
