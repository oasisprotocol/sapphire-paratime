// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import {StakingAddress, StakingSecretKey} from "./ConsensusUtils.sol";

/**
 * @title SDK Subcall wrappers
 * @dev Interact with Oasis Runtime SDK modules from Sapphire
 */
library Subcall {
    string private constant CONSENSUS_DELEGATE = "consensus.Delegate";
    string private constant CONSENSUS_UNDELEGATE = "consensus.Undelegate";
    string private constant CONSENSUS_WITHDRAW = "consensus.Withdraw";
    string private constant ACCOUNTS_TRANSFER = "accounts.Transfer";

    address internal constant SUBCALL =
        0x0100000000000000000000000000000000000103;

    /// Only raised if the underlying subcall precompile does not succeed
    error Subcall_Error();

    /**
     * Submit a native message to the Oasis runtime layer
     *
     * Messages which re-enter the EVM module are forbidden: evm.*
     *
     * @param method Native message type
     * @param body CBOR encoded body
     * @return status Result of call
     * @return data CBOR encoded result
     */
    function subcall(string memory method, bytes memory body)
        internal
        returns (uint64 status, bytes memory data)
    {
        (bool success, bytes memory tmp) = SUBCALL.call(
            abi.encode(method, body)
        );

        if (!success) {
            revert Subcall_Error();
        }

        (status, data) = abi.decode(tmp, (uint64, bytes));
    }

    function _subcallWithToAndAmount(
        string memory method,
        StakingAddress to,
        uint128 value
    ) internal returns (uint64 status, bytes memory data) {
        (status, data) = subcall(
            method,
            abi.encodePacked(
                hex"a262",
                "to",
                hex"55",
                to,
                hex"66",
                "amount",
                hex"8250",
                value,
                hex"40"
            )
        );
    }

    error ConsensusUndelegateError(uint64 status, string data);

    /**
     * Start the undelegation process of the given number of shares from
     * consensus staking account to runtime account.
     *
     * @param from Consensus address which shares were delegated to
     * @param shares Number of shares to withdraw back to us
     */
    function consensusUndelegate(StakingAddress from, uint128 shares) internal {
        (uint64 status, bytes memory data) = subcall(
            CONSENSUS_UNDELEGATE,
            abi.encodePacked(
                hex"a264",
                "from",
                hex"55",
                from,
                hex"66",
                "shares",
                hex"50",
                shares
            )
        );

        if (status != 0) {
            revert ConsensusUndelegateError(status, string(data));
        }
    }

    error ConsensusDelegateError(uint64 status, string data);

    /**
     * Delegate native token to consensus level
     *
     * @param to Consensus address shares are delegated to
     * @param value Native token amount (in wei)
     */
    function consensusDelegate(StakingAddress to, uint128 value) internal {
        (uint64 status, bytes memory data) = _subcallWithToAndAmount(
            CONSENSUS_DELEGATE,
            to,
            value
        );

        if (status != 0) {
            revert ConsensusDelegateError(status, string(data));
        }
    }

    error ConsensusWithdrawError(uint64 status, string data);

    /**
     * Transfer from an account in this runtime to a consensus staking account.
     *
     * @param to Consensus address which gets the tokens
     * @param value Native token amount (in wei)
     */
    function consensusWithdraw(StakingAddress to, uint128 value) internal {
        (uint64 status, bytes memory data) = _subcallWithToAndAmount(
            CONSENSUS_WITHDRAW,
            to,
            value
        );

        if (status != 0) {
            revert ConsensusWithdrawError(status, string(data));
        }
    }

    error AccountsTransferError(uint64 status, string data);

    /**
     * Perform a transfer to another account
     *
     * This is equivalent of `payable(to).transfer(value);`
     *
     * @param to Destination account
     * @param value native token amount (in wei)
     */
    function accountsTransfer(address to, uint128 value) internal {
        (uint64 status, bytes memory data) = _subcallWithToAndAmount(
            ACCOUNTS_TRANSFER,
            StakingAddress.wrap(bytes21(abi.encodePacked(uint8(0x00), to))),
            value
        );

        if (status != 0) {
            revert AccountsTransferError(status, string(data));
        }
    }
}
