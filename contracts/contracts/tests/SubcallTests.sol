// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import {Sapphire} from "../Sapphire.sol";
import {Subcall} from "../Subcall.sol";

contract SubcallTests {
    event SubcallResult(uint64 status, bytes data);

    constructor ()
        payable
    {

    }

    function testSubcall(string memory method, bytes memory data) external {
        uint64 status;

        (status, data) = Sapphire.subcall(method, data);

        emit SubcallResult(status, data);
    }

    function testAccountsTransfer (address to, uint128 value)
        external
    {
        Subcall.accounts_Transfer(to, value);
    }
}
