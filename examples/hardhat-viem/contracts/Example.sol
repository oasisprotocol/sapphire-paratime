// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

contract Example {
    address private owner;

    constructor()
    {
        owner = msg.sender;
    }

    function setOwner(address in_owner)
        public
    {
        require( msg.sender == owner, "not owner!" );

        owner = in_owner;
    }

    function setOwner()
        external
    {
        setOwner(msg.sender);
    }

    function getOwner()
        external view
        returns (address)
    {
        return owner;
    }

    function getMsgSender()
        external view
        returns (address)
    {
        return msg.sender;
    }
}
