// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/metatx/ERC2771Context.sol";

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

    function _msgSender() internal view override returns (address) {
        if (msg.sender != messageBus) return ERC2771Context._msgSender();
        return address(bytes20(msg.data[36:56])); // [bytes4 epsel, uint seq, address actor, data]
    }
}
