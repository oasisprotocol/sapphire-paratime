// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {Endpoint} from "./Endpoint.sol";

/**
 * @title OPL Enclave
 * @dev The Sapphire-side of an OPL dapp.
 */
contract Enclave is Endpoint {
    constructor(address _host, bytes32 _hostChain)
        Endpoint(_host, _hostChain)
    {} // solhint-disable-line no-empty-blocks
}
