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
        ERC2771Context(block.chainid == 0x5aff ? address(0) : address(1))
    {} // solhint-disable-line no-empty-blocks
}
