// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

library Subcall {
    address internal constant SUBCALL =
        0x0100000000000000000000000000000000000103;

    /**
     * Submit a native message to the Oasis runtime layer
     *
     * Messages which re-enter the EVM module are forbidden: evm.*
     *
     * @param method Native message type
     * @param body CBOR encoded body
     * @return status_code Result of call
     * @return data CBOR encoded result
     */
    function subcall(string memory method, bytes memory body)
        internal
        returns (uint64 status_code, bytes memory data)
    {
        (bool success, bytes memory tmp) = SUBCALL.call(
            abi.encode(method, body)
        );

        require(success, "subcall");

        (status_code, data) = abi.decode(tmp, (uint64, bytes));
    }

    function accounts_Transfer(address to, uint128 value)
        internal
    {
        (uint64 status_code,) = subcall("accounts.Transfer", abi.encodePacked(
            hex"a262746f5500",
            to,
            hex"66616d6f756e748250",
            value,
            hex"40"
        ));
        require( status_code == 0 );
    }
}
