// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {EthereumUtils, SignatureRSV} from "../../EthereumUtils.sol";
import {SiweAuth} from "../../auth/SiweAuth.sol";

contract SiweAuthTests is SiweAuth {
    address private _owner;

    constructor(string memory domain) SiweAuth(domain) {
        _owner = msg.sender;
    }

    function testVerySecretMessage(bytes calldata bearer)
        external
        view
        returns (string memory)
    {
        if (authMsgSender(bearer) != _owner) {
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

    function testAuthMsgSender(bytes calldata bearer)
        external
        view
        returns (address)
    {
        return authMsgSender(bearer);
    }

    function testRevokeBearer(bytes32 bearer) external {
        return revokeBearer(bearer);
    }
}
