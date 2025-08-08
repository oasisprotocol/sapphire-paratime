// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import {ConsensusUtils, StakingAddress, StakingSecretKey} from "../ConsensusUtils.sol";
import {Subcall, SubcallReceiptKind} from "../Subcall.sol";

contract SubcallTests {
    event SubcallResult(uint64 status, bytes data);

    constructor() payable { // solhint-disable-line
        // Do nothing, but allow balances to be sent on construction.
    }

    receive() external payable {    // solhint-disable-line
        // Do nothing, but allow contract to receive native ROSE.
    }

    function generateRandomAddress()
        external
        view
        returns (StakingAddress publicKey, StakingSecretKey secretKey)
    {
        return ConsensusUtils.generateStakingAddress("");
    }

    function testSubcall(string memory method, bytes memory data)
        external
        payable
    {
        uint64 status;

        (status, data) = Subcall.subcall(method, data);

        emit SubcallResult(status, data);
    }

    function testTakeReceipt(SubcallReceiptKind kind, uint64 receiptId)
        external
        returns (bytes memory result)
    {
        result = Subcall.consensusTakeReceipt(kind, receiptId);

        emit Result(result);
    }

    function testDecodeReceiptDelegate(bytes memory receipt)
        external
        pure
        returns (uint128)
    {
        return Subcall._decodeReceiptDelegate(0, receipt);
    }

    function testDecodeReceiptUndelegateStart(bytes memory receipt)
        external
        pure
        returns (uint256, uint256)
    {
        return Subcall._decodeReceiptUndelegateStart(receipt);
    }

    function testDecodeReceiptUndelegateDone(bytes memory receipt)
        external
        pure
        returns (uint256)
    {
        return Subcall._decodeReceiptUndelegateDone(receipt);
    }

    function testAccountsTransfer(address to, uint128 value) external {
        Subcall.accountsTransfer(to, value);
    }

    function testConsensusDelegate(StakingAddress to, uint128 value)
        external
        payable
    {
        Subcall.consensusDelegate(to, value);
    }

    event Result(bytes data);

    function testConsensusDelegateWithReceipt(
        StakingAddress to,
        uint128 value,
        uint64 receiptId
    ) external payable returns (bytes memory result) {
        result = Subcall.consensusDelegate(to, value, receiptId);

        emit Result(result);
    }

    function testConsensusUndelegate(StakingAddress to, uint128 value)
        external
    {
        Subcall.consensusUndelegate(to, value);
    }

    function testConsensusUndelegateWithReceipt(
        StakingAddress to,
        uint128 value,
        uint64 receiptId
    ) external {
        Subcall.consensusUndelegate(to, value, receiptId);
    }

    function testConsensusWithdraw(StakingAddress to, uint128 value) external {
        Subcall.consensusWithdraw(to, value);
    }

    function testRoflEnsureAuthorizedOrigin(bytes21 appId) external view {
        Subcall.roflEnsureAuthorizedOrigin(appId);
    }

    function testGetRoflAppId() external view returns (bytes21) {
        return Subcall.getRoflAppId();
    }

    event RawResult(uint64, bytes);

    function testParseCallDataPublicKey(bytes memory data)
        external
        pure
        returns (uint256 epoch, Subcall.CallDataPublicKey memory public_key)
    {
        (epoch, public_key) = Subcall._parseCBORCallDataPublicKey(data);
    }

    function testCoreCallDataPublicKey()
        external
        view
        returns (uint256 epoch, Subcall.CallDataPublicKey memory public_key)
    {
        (epoch, public_key) = Subcall.coreCallDataPublicKey();
    }

    function testCoreCurrentEpoch() external view returns (uint256 epoch) {
        return Subcall.coreCurrentEpoch();
    }
}
