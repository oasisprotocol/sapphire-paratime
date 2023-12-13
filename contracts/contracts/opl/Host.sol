// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {Endpoint, autoswitch} from "./Endpoint.sol";

/**
 * @title OPL Host
 * @notice The L1-side of an OPL dApp.
 */
contract Host is Endpoint {
    // solhint-disable-next-line no-empty-blocks
    constructor(address _enclave) Endpoint(_enclave, autoswitch("sapphire")) {}
}
