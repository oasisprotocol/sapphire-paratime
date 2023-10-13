// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import {Subcall, StakingAddress} from "./Subcall.sol";

contract Staking {
    /// Incremented counter to determine receipt IDs
    uint64 private lastReceiptId;

    mapping(uint64 => PendingDelegation) private pendingDelegations;

    /// (from, to) => shares
    mapping(address => mapping(StakingAddress => uint128)) private delegations;

    /// (receiptId => PendingUndelegation)
    mapping(uint64 => PendingUndelegation) private pendingUndelegations;

    /// (endReceiptId => UndelegationPool)
    mapping(uint64 => UndelegationPool) private undelegationPools;

    // -------------------------------------------------------------------------

    struct PendingDelegation {
        address from;
        StakingAddress to;
        uint128 amount;
    }

    struct PendingUndelegation {
        StakingAddress from;
        address payable to;
        uint128 shares;
        uint64 endReceiptId;
        uint64 epoch;
    }

    struct UndelegationPool {
        uint128 totalShares;
        uint128 totalAmount;
    }

    constructor() {
        // Due to an oddity in the oasis-cbor package, we start at 2**32
        // Otherwise uint64 parsing will fail and the message is rejected
        lastReceiptId = 4294967296;
    }

    function delegate(StakingAddress to) public payable returns (uint64) {
        // Whatever is sent to the contract is delegated.
        require(msg.value < type(uint128).max);

        uint128 amount = uint128(msg.value);

        uint64 receiptId = lastReceiptId;

        Subcall.consensusDelegate(to, amount, receiptId);

        pendingDelegations[receiptId] = PendingDelegation(
            msg.sender,
            to,
            amount
        );

        return receiptId;
    }

    function delegateDone(uint64 receiptId) public returns (uint128 shares) {
        PendingDelegation memory pending = pendingDelegations[receiptId];

        require(pending.from != address(0), "unknown receipt");

        shares = Subcall.consensusTakeReceiptDelegate(receiptId);

        // Remove pending delegation.
        delete pendingDelegations[receiptId];
    }

    function undelegate(StakingAddress from, uint128 shares)
        public
        returns (uint64)
    {
        require(shares > 0, "must undelegate some shares");

        require(
            delegations[msg.sender][from] >= shares,
            "must have enough delegated shares"
        );

        uint64 receiptId = lastReceiptId++;

        Subcall.consensusUndelegate(from, shares, receiptId);

        delegations[msg.sender][from] -= shares;

        pendingUndelegations[receiptId] = PendingUndelegation({
            from: from,
            to: payable(msg.sender),
            shares: shares,
            endReceiptId: 0,
            epoch: 0
        });

        return receiptId;
    }

    function undelegateStart(uint64 receiptId) public {
        PendingUndelegation storage pending = pendingUndelegations[receiptId];

        require(pending.to != address(0), "unknown receipt");

        (uint64 epoch, uint64 endReceipt) = Subcall
            .consensusTakeReceiptUndelegateStart(receiptId);

        pending.endReceiptId = endReceipt;

        pending.epoch = epoch;

        undelegationPools[endReceipt].totalShares += pending.shares;
    }

    function undelegateDone(uint64 receiptId) public {
        PendingUndelegation memory pending = pendingUndelegations[receiptId];

        require(pending.to != address(0), "unknown receipt");

        require(pending.endReceiptId > 0, "must call undelegateStart first");

        UndelegationPool memory pool = undelegationPools[pending.endReceiptId];

        if (pool.totalAmount == 0) {
            // Did not fetch the end receipt yet, do it now.
            uint128 amount = Subcall.consensusTakeReceiptUndelegateDone(
                pending.endReceiptId
            );

            undelegationPools[pending.endReceiptId].totalAmount = amount;

            pool.totalAmount = amount;
        }

        // Compute how much we get from the pool and transfer the amount.
        uint256 transferAmount = (uint256(pending.shares) *
            uint256(pool.totalAmount)) / pool.totalShares;

        pending.to.transfer(transferAmount);

        delete pendingUndelegations[receiptId];
    }
}
