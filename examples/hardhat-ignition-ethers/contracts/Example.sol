// SPDX-License-Identifier: CC-PDDC

pragma solidity ^0.8.0;

contract Example {
    address public owner;

    constructor () {
        owner = msg.sender;
    }

    function getMsgSender ()
        external view
        returns (address)
    {
        return msg.sender;
    }

    function doNothing ()
        external
    {

    }

    function clearOwner ()
        external
    {
        owner = address(0);
    }

    function changeOwner (address in_newOwner)
        external
    {
        if( owner != address(0) ) {
            require( msg.sender == owner, "not owner" );
        }

        owner = in_newOwner;
    }
}
