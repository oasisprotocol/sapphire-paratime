// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "@openzeppelin/contracts/utils/Context.sol";

import "./Endpoint.sol";

/**
 * @title OPL Enclave
 * @dev The Sapphire-side of an OPL dapp.
 */
contract Enclave is Endpoint, ERC2771Context {
    constructor(address _host, bytes32 _hostChain)
        Endpoint(_host, _hostChain)
        ERC2771Context(block.chainid == 0x5aff ? address(0) : address(0)) // TODO: insert gsn deployment
    {} // solhint-disable-line no-empty-blocks

    // The following functions are overrides required by Solidity.
    function _msgData()
        internal
        view
        override(Context, ERC2771Context)
        returns (bytes calldata)
    {
        return ERC2771Context._msgData();
    }

    function _msgSender()
        internal
        view
        override(Context, ERC2771Context)
        returns (address)
    {
        return ERC2771Context._msgSender();
    }
}
