// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

contract Example {
    error CustomError123(string reason, address value);

    event CustomEvent(uint256 value);

    address public owner;
    address public creator;

    constructor(address in_newOwner) {
        creator = msg.sender;
        owner = in_newOwner;
    }

    function emitEvent(uint256 in_value)
        public
    {
        emit CustomEvent(in_value);
    }

    function setOwner(address in_newOwner)
        public
    {
        owner = in_newOwner;
    }

    function revertWithReason(string calldata reason)
        public view
        returns (address)
    {
        require(false, reason);
        return msg.sender;
    }

    function revertWithCustomError(string calldata reason)
        public view
    {
        revert CustomError123(reason, msg.sender);
    }
}
