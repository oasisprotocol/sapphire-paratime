// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import {Staking,StakingAddress} from "../Staking.sol";

contract StakingTests {
    Staking[] public stakers;

    constructor (uint n) {
        for( uint i = 0; i < n; i++ ) {
            stakers.push(new Staking());
        }
    }

    function delegate(StakingAddress[] memory in_validators)
        external payable
    {
        uint amt = msg.value / in_validators.length;

        for( uint i = 0; i < in_validators.length; i++ )
        {
            stakers[i % stakers.length].delegate{value: amt}(in_validators[i]);
        }
    }
}
