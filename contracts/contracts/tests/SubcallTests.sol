// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import {Sapphire} from "../Sapphire.sol";
import {Subcall,ConsensusUtils,StakingPublicKey,StakingSecretKey} from "../Subcall.sol";

contract SubcallTests {
    event SubcallResult(uint64 status, bytes data);

    constructor ()
        payable
    {

    }

    receive () external payable
    { }

    function generateRandomAddress ()
        external view
        returns (
            StakingPublicKey publicKey,
            StakingSecretKey secretKey
        )
    {
        return ConsensusUtils.generateStakingAddress("");
    }

    function testSubcall(string memory method, bytes memory data) external {
        uint64 status;

        (status, data) = Sapphire.subcall(method, data);

        emit SubcallResult(status, data);
    }

    function testAccountsTransfer (StakingPublicKey to, uint128 value)
        external
    {
        Subcall.accounts_Transfer(to, value);
    }

    function testConsensusDelegate (StakingPublicKey to, uint128 value)
        external
    {
        Subcall.consensus_Delegate(to, value);
    }

    function testConsensusUndelegate (StakingPublicKey to, uint128 value)
        external
    {
        Subcall.consensus_Undelegate(to, value);
    }

    function testConsensusDeposit (StakingPublicKey to, uint128 value)
        external
    {
        Subcall.consensus_Deposit(to, value);
    }

    function testConsensusWithdraw (StakingPublicKey to, uint128 value)
        external
    {
        Subcall.consensus_Withdraw(to, value);
    }
}
