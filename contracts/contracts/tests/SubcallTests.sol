// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import {ConsensusUtils, StakingAddress, StakingSecretKey} from "../ConsensusUtils.sol";
import {Subcall} from "../Subcall.sol";

contract SubcallTests {
    event SubcallResult(uint64 status, bytes data);

    constructor() payable {}

    receive() external payable {}

    function generateRandomAddress()
        external
        view
        returns (StakingAddress publicKey, StakingSecretKey secretKey)
    {
        return ConsensusUtils.generateStakingAddress("");
    }

    function testSubcall(string memory method, bytes memory data) external {
        uint64 status;

        (status, data) = Subcall.subcall(method, data);

        emit SubcallResult(status, data);
    }

    function testAccountsTransfer(address to, uint128 value) external {
        Subcall.accountsTransfer(to, value);
    }

    function testConsensusDelegate(StakingAddress to, uint128 value) external {
        Subcall.consensusDelegate(to, value);
    }

    function testConsensusUndelegate(StakingAddress to, uint128 value)
        external
    {
        Subcall.consensusUndelegate(to, value);
    }

    function testConsensusWithdraw(StakingAddress to, uint128 value) external {
        Subcall.consensusWithdraw(to, value);
    }
}
