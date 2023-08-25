// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

contract SignedQueriesTests {
    function testSignedQueries()
        external
        view
        returns (address)
    {
        return msg.sender;
    }
}
