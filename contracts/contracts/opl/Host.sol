// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./Endpoint.sol";

/**
 * @title OPL Host
 * @dev The L1-side of an OPL dapp.
 */
contract Host is Endpoint {
    // solhint-disable-next-line no-empty-blocks
    constructor(address _enclave) Endpoint(_enclave, autoswitch("sapphire")) {}
}
