// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import {StakingAddress, StakingSecretKey} from "./ConsensusUtils.sol";

enum SubcallReceiptKind {
    Invalid,
    Delegate,
    UndelegateStart,
    UndelegateDone
}

/**
 * @title SDK Subcall wrappers
 * @dev Interact with Oasis Runtime SDK modules from Sapphire.
 */
library Subcall {
    string private constant CONSENSUS_DELEGATE = "consensus.Delegate";
    string private constant CONSENSUS_UNDELEGATE = "consensus.Undelegate";
    string private constant CONSENSUS_WITHDRAW = "consensus.Withdraw";
    string private constant CONSENSUS_TAKE_RECEIPT = "consensus.TakeReceipt";
    string private constant ACCOUNTS_TRANSFER = "accounts.Transfer";

    /// Address of the SUBCALL precompile
    address internal constant SUBCALL =
        0x0100000000000000000000000000000000000103;

    /// Raised if the underlying subcall precompile does not succeed
    error SubcallError();

    /// There was an error parsing the receipt
    error ParseReceiptError(uint64 receiptId);

    error ConsensusUndelegateError(uint64 status, string data);

    error ConsensusDelegateError(uint64 status, string data);

    error ConsensusTakeReceiptError(uint64 status, string data);

    error ConsensusWithdrawError(uint64 status, string data);

    error AccountsTransferError(uint64 status, string data);

    /**
     * Submit a native message to the Oasis runtime layer.
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
            revert SubcallError();
        }

        (status, data) = abi.decode(tmp, (uint64, bytes));
    }

    /**
     * @dev Generic method to call `{to:address, amount:uint128}`
     * @param method Runtime SDK method name ('module.Action')
     * @param to Destination address
     * @param value Amount specified
     * @return status Non-zero on error
     * @return data Module name on error
     */
    function _subcallWithToAndAmount(
        string memory method,
        StakingAddress to,
        uint128 value,
        bytes memory token
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
                uint8(0x40 + token.length),
                token
            )
        );
    }

    /**
     * Returns a CBOR encoded structure, containing the following possible keys.
     * All keys are optional:
     *
     *  shares: u128
     *  epoch: EpochTime
     *  receipt: u64
     *  amount: u128
     *  error: {module: string, code: u32}
     *
     * Delegate will have the `error` or `shares` keys.
     * UndelegateStart will have the `epoch` and `receipt` keys.
     * UndelegateDone will have the `amount` key
     *
     * @param kind 1=Delegate, 2=UndelegateStart, 3=UndelegateDone
     * @param receiptId ID of receipt
     */
    function consensusTakeReceipt(SubcallReceiptKind kind, uint64 receiptId)
        internal
        returns (bytes memory)
    {
        require(receiptId != 0);

        require(uint8(kind) > 0 && uint8(kind) <= 23);

        (bool success, bytes memory data) = SUBCALL.call(
            abi.encode(
                CONSENSUS_TAKE_RECEIPT,
                abi.encodePacked(
                    hex"a2", // Map, 2 pairs
                    hex"62",
                    "id", // Byte string, 2 bytes
                    hex"1b",
                    receiptId, // Unsigned 64bit integer
                    hex"64",
                    "kind", // Byte string, 4 bytes
                    uint8(kind) // uint8 <= 23.
                )
            )
        );

        require(success);

        (uint64 status, bytes memory result) = abi.decode(data,(uint64, bytes));

        if (status != 0) {
            revert ConsensusTakeReceiptError(status, string(result));
        }

        return result;
    }

    function _parseCBORUint(bytes memory result, uint offset)
        public pure
        returns (uint newOffset, uint value)
    {
        require( result[offset] & 0x40 == 0x40, "invalid len" );

        uint len = uint8(result[offset++]) ^ 0x40;

        require( len < 0x20 );

        assembly {
            value := mload(add(add(0x20,result),offset))
        }

        value = value >> (256-(len*8));

        newOffset = offset + len;
    }

    function _parseCBORUint64(bytes memory result, uint offset)
        public pure
        returns (uint newOffset, uint64 value)
    {
        uint tmp;

        (newOffset, tmp) = _parseCBORUint(result, offset);

        require( tmp <= type(uint64).max );

        value = uint64(tmp);
    }

    function _parseCBORUint128(bytes memory result, uint offset)
        public pure
        returns (uint newOffset, uint128 value)
    {
        uint tmp;

        (newOffset, tmp) = _parseCBORUint(result, offset);

        require( tmp <= type(uint128).max );

        value = uint128(tmp);
    }

    function _parseCBORKey(
        bytes memory result,
        uint offset
    )
        internal pure
        returns (uint newOffset, bytes32 keyDigest)
    {
        require( result[offset] & 0x60 == 0x60, "invalid key" );

        uint8 len = uint8(result[offset++]) ^ 0x60;

        assembly {
            keyDigest := keccak256(add(add(0x20,result),offset),len)
        }

        newOffset = offset + len;
    }

    function _decodeReceiptUndelegateStart (bytes memory result)
        internal pure
        returns (uint64 epoch, uint64 endReceipt)
    {
        uint offset = 1;

        bool hasEpoch = false;

        bool hasReceipt = false;

        require( result[0] == 0xA2, "invalid map" );

        while( offset < result.length )
        {
            bytes32 keyDigest;

            (offset, keyDigest) = _parseCBORKey(result, offset);

            if( keyDigest == keccak256("epoch") )
            {
                (offset, epoch) = _parseCBORUint64(result, offset);

                hasEpoch = true;
            }
            else if( keyDigest == keccak256("receipt") )
            {
                (offset, endReceipt) = _parseCBORUint64(result, offset);

                hasReceipt = true;
            }
            else {
                // TODO: skip unknown keys & values? For forward compatibility
                require( false, "Invalid key" );
            }
        }

        require( hasEpoch && hasReceipt );
    }

    function _decodeReceiptUndelegateDone (bytes memory result)
        internal pure
        returns (uint128 amount)
    {
        uint offset = 1;

        bool hasAmount = false;

        require( result[0] == 0xA1, "invalid map" );

        while( offset < result.length )
        {
            bytes32 keyDigest;

            (offset, keyDigest) = _parseCBORKey(result, offset);

            if( keyDigest == keccak256("amount") )
            {
                (offset, amount) = _parseCBORUint128(result, offset);

                hasAmount = true;
            }
            else {
                // TODO: skip unknown keys & values? For forward compatibility
                require( false, "Invalid key" );
            }
        }

        require( hasAmount );
    }

    /**
     * Decodes a 'Delegate' receipt
     * @param receiptId Previously unretrieved receipt
     * @param result CBOR encoded {shares: u128}
     */
    function _decodeReceiptDelegate(uint64 receiptId, bytes memory result)
        internal
        pure
        returns (uint128 shares)
    {
        require( result[0] == 0xA1, "invalid map" );

        if (result[0] == 0xA1 && result[1] == 0x66 && result[2] == "s") {
            // Delegation succeeded, decode number of shares.
            uint8 sharesLen = uint8(result[8]) & 0x1f; // Assume shares field is never greater than 16 bytes.

            require(9 + sharesLen == result.length);

            for (uint256 offset = 0; offset < sharesLen; offset++) {
                uint8 v = uint8(result[9 + offset]);

                shares += uint128(v) << (8 * uint128(sharesLen - offset - 1));
            }
        } else {
            revert ParseReceiptError(receiptId);
        }
    }

    function consensusTakeReceiptDelegate(uint64 receiptId)
        internal
        returns (uint128 shares)
    {
        bytes memory result = consensusTakeReceipt(SubcallReceiptKind.Delegate, receiptId);

        shares = _decodeReceiptDelegate(receiptId, result);
    }

    function consensusTakeReceiptUndelegateStart (uint64 receiptId)
        internal
        returns (uint64 epoch, uint64 endReceipt)
    {
        bytes memory result = consensusTakeReceipt(SubcallReceiptKind.UndelegateStart, receiptId);

        (epoch, endReceipt) = _decodeReceiptUndelegateStart(result);
    }

    function consensusTakeReceiptUndelegateDone (uint64 receiptId)
        internal
        returns (uint128 amount)
    {
        bytes memory result = consensusTakeReceipt(SubcallReceiptKind.UndelegateStart, receiptId);

        (amount) = _decodeReceiptUndelegateDone(result);
    }

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
                hex"a2",    // map, 2 pairs
                // pair 1
                hex"64",    // UTF-8 string, 4 bytes
                "from",
                hex"55",    // 21 bytes
                from,
                // pair 2
                hex"66",    // UTF-8 string, 6 bytes
                "shares",
                hex"50",    // 128bit unsigned int (16 bytes)
                shares
            )
        );

        if (status != 0) {
            revert ConsensusUndelegateError(status, string(data));
        }
    }

    function consensusUndelegate(
        StakingAddress from,
        uint128 shares,
        uint64 receiptId
    )
        internal
    {
        // XXX: due to weirdness in oasis-cbor, `0x1b || 8 bytes` requires `value >= 2**32`
        require(receiptId >= 4294967296);

        (uint64 status, bytes memory data) = subcall(
            CONSENSUS_UNDELEGATE,
            abi.encodePacked(
                hex"a3",    // map, 3 pairs
                // pair 1
                hex"64",    // UTF-8 string, 4 bytes
                "from",
                hex"55",    // 21 bytes
                from,
                // pair 2
                hex"66",    // UTF-8 string, 6 bytes
                "shares",
                hex"50",    // 16 bytes
                shares,
                // pair 3
                hex"67",    // UTF-8 string, 7 bytes
                "receipt",
                hex"1b",    // 64bit unsigned int
                receiptId
            )
        );

        if (status != 0) {
            revert ConsensusUndelegateError(status, string(data));
        }
    }

    /**
     * Delegate native token to consensus level.
     *
     * @param to Consensus address shares are delegated to
     * @param amount Native token amount (in wei)
     */
    function consensusDelegate(StakingAddress to, uint128 amount)
        internal
        returns (bytes memory data)
    {
        uint64 status;

        (status, data) = _subcallWithToAndAmount(
            CONSENSUS_DELEGATE,
            to,
            amount,
            ""
        );

        if (status != 0) {
            revert ConsensusDelegateError(status, string(data));
        }
    }

    /**
     * Delegate native token to consensus level.
     *
     * Requests that the number of shares allocated can be retrieved with a
     * receipt. The receipt will be of `ReceiptKind.DelegateDone` and can be
     * decoded using `decodeReceiptDelegateDone`
     *
     * @param to Consensus address shares are delegated to
     * @param amount Native token amount (in wei)
     * @param receiptId contract-specific receipt to retrieve result
     */
    function consensusDelegate(
        StakingAddress to,
        uint128 amount,
        uint64 receiptId
    ) internal returns (bytes memory data) {
        // XXX: due to weirdness in oasis-cbor, `0x1b || 8 bytes` requires `value >= 2**32`
        require(receiptId >= 4294967296);

        uint64 status;

        (status, data) = subcall(
            CONSENSUS_DELEGATE,
            abi.encodePacked(   // CBOR encoded, {to: w, amount: [x, y], receipt: z}
                hex"a3",        // map, 3 pairs
                // pair 1
                hex"62",        // UTF-8 string, 2 byte
                "to",
                hex"55",        // byte string, 21 bytes
                to,
                // pair 2
                hex"66",        // UTF-8 string, 6 bytes
                "amount",
                hex"82",        // Array, 2 elements
                hex"50",        // byte string, 16 bytes
                amount,
                // TODO: handle non-native token!
                hex"40",        // byte string, 0 to 23 bytes
                // pair 3
                hex"67",
                "receipt",      // UTF-8 string, 7 bytes
                hex"1b",
                receiptId       // uint64, 8 bytes
            )
        );

        if (status != 0) {
            revert ConsensusDelegateError(status, string(data));
        }
    }

    /**
     * Transfer from an account in this runtime to a consensus staking account.
     *
     * @param to Consensus address which gets the tokens
     * @param value Token amount (in wei)
     */
    function consensusWithdraw(StakingAddress to, uint128 value) internal {
        (uint64 status, bytes memory data) = _subcallWithToAndAmount(
            CONSENSUS_WITHDRAW,
            to,
            value,
            ""
        );

        if (status != 0) {
            revert ConsensusWithdrawError(status, string(data));
        }
    }

    /**
     * Perform a transfer to another account.
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
            value,
            ""
        );

        if (status != 0) {
            revert AccountsTransferError(status, string(data));
        }
    }
}
