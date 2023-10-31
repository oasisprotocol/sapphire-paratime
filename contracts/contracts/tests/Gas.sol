// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import {Sapphire} from "../Sapphire.sol";

contract GasTests {
    bytes32 tmp;

    function testConstantTime(uint256 useGas, uint128 padGasAmount) external {
        if (useGas == 1) {
            bytes32 x;

            for (uint256 i = 0; i < 100; i++) {
                x = keccak256(abi.encodePacked(x, tmp));
            }

            tmp = x;
        }

        Sapphire.padGas(padGasAmount);
    }
}
