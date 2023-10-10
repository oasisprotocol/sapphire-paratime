// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

contract Staking {
    string private constant CONSENSUS_DELEGATE = "consensus.Delegate";
    string private constant CONSENSUS_UNDELEGATE = "consensus.Undelegate";
    string private constant CONSENSUS_TAKE_RECEIPT = "consensus.TakeReceipt";

    bytes private constant TOKEN = bytes("TEST");

    uint8 private constant RECEIPT_KIND_DELEGATE = 1;
    uint8 private constant RECEIPT_KIND_UNDELEGATE_START = 2;
    uint8 private constant RECEIPT_KIND_UNDELEGATE_DONE = 3;

    address private constant SUBCALL = 0x0100000000000000000000000000000000000103;

    // -------------------------------------------------------------------------

    /// An error was returned from the subcall
    error SubcallFailed(uint64 code, bytes module);

    /// There was an error parsing the receipt
    error ParseReceiptError(uint64 receiptId);

    // -------------------------------------------------------------------------

    /// Incremented counter to determine receipt IDs
    uint64 private lastReceiptId;

    mapping(uint64 receiptId => PendingDelegation) private pendingDelegations;

    /// (from, to) => shares
    mapping(address => mapping(bytes21 => uint128)) private delegations;

    /// (receiptId => PendingUndelegation)
    mapping(uint64 => PendingUndelegation) private pendingUndelegations;

    /// (endReceiptId => UndelegationPool)
    mapping(uint64 => UndelegationPool) private undelegationPools;

    // -------------------------------------------------------------------------

    struct PendingDelegation {
        address from;
        bytes21 to;
        uint128 amount;
    }

    struct PendingUndelegation {
        bytes21 from;
        address payable to;
        uint128 shares;
        uint8 endReceiptId;
    }

    struct UndelegationPool {
        uint128 totalShares;
        uint128 totalAmount;
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
    function _takeReceipt(uint8 kind, uint64 receiptId)
        internal
        returns (bytes memory)
    {
        require( receiptId != 0 );
        require( kind > 0 && kind < 23 );

        (bool success, bytes memory data) = SUBCALL.call(abi.encode(
            CONSENSUS_TAKE_RECEIPT,
            abi.encodePacked(
                hex"a2",                    // Map, 2 pairs
                    hex"62", "id",          // Byte string, 2 bytes
                        hex"1b", receiptId, // Unsigned 64bit integer
                    hex"64", "kind",        // Byte string, 4 bytes
                        kind                // uint8 <= 23.
            )
        ));
        require( success );

        (uint64 status, bytes memory result) = abi.decode(data, (uint64, bytes));
        if (status != 0) {
            revert SubcallFailed(status, result);
        }

        return result;
    }

    /**
     *
     * @param to
     */
    function delegate(bytes21 to)
        public payable
        returns (uint64)
    {
        // Whatever is sent to the contract is delegated.
        require(msg.value < type(uint128).max);

        uint128 amount = uint128(msg.value);

        uint64 receiptId = ++lastReceiptId;

        // Delegate to target address.
        (bool success, bytes memory data) = SUBCALL.call(abi.encode(
            CONSENSUS_DELEGATE,
            abi.encodePacked(               // CBOR encoded, {to: w, amount: [x, y], receipt: z}
                hex"a3",                    // map, 3 pairs
                    hex"62", "to",          // UTF-8 string, 2 byte
                        hex"55", to,        // byte string, 21 bytes
                    hex"66", "amount",      // UTF-8 string, 6 bytes
                        hex"82",            // Array, 2 elements
                            hex"50", amount,// byte string, 16 bytes
                            uint8(0x40 + TOKEN.length), TOKEN,        // byte string, 0 to 23 bytes
                    hex"67", "receipt",     // UTF-8 string, 7 bytes
                        hex"1b", receiptId  // Unsigned 64bit integer
            )
        ));
        require( success );

        (uint64 status, bytes memory result) = abi.decode(data, (uint64, bytes));
        if (status != 0) {
            revert SubcallFailed(status, result);
        }

        pendingDelegations[receiptId] = PendingDelegation(msg.sender, to, amount);

        return receiptId;
    }

    function delegateDone(uint64 receiptId)
        public
        returns (uint128 shares)
    {
        PendingDelegation memory pending = pendingDelegations[receiptId];
        require(pending.from != address(0), "unknown receipt");

        bytes memory result = _takeReceipt(RECEIPT_KIND_DELEGATE, receiptId);

        // This is a very lazy CBOR decoder. It assumes that if there is only a shares field then
        // the delegation operation succeeded and if not, there was some sort of error which is
        // not decoded.
        if (result[0] == 0xA1 && result[1] == 0x66 && result[2] == "s") {
            // Delegation succeeded, decode number of shares.
            uint8 sharesLen = uint8(result[8]) & 0x1f; // Assume shares field is never greater than 16 bytes.
            for (uint offset = 0; offset < sharesLen; offset++) {
                uint8 v = uint8(result[9 + offset]);
                shares += uint128(v) << 8*uint128(sharesLen - offset - 1);
            }

            // Add to given number of shares.
            delegations[pending.from][pending.to] += shares;
        } else {
            revert ParseReceiptError(receiptId);
        }

        // Remove pending delegation.
        delete pendingDelegations[receiptId];
    }

    function undelegate(bytes21 from, uint128 shares)
        public
        returns (uint64)
    {
        require(shares > 0, "must undelegate some shares");
        require(delegations[msg.sender][from] >= shares, "must have enough delegated shares");

        lastReceiptId++;
        uint64 receiptId = lastReceiptId;
        require(receiptId <= 23, "receipt identifier overflow"); // Because our CBOR encoder is lazy.

        // Start undelegation from source address.
        (bool success, bytes memory data) = SUBCALL.call(abi.encode(
            CONSENSUS_UNDELEGATE,
            abi.encodePacked(
                hex"a3",
                    hex"64", "from",        // UTF-8 string, 4 bytes
                        hex"55", from,      // 21 bytes
                    hex"66", "shares",      // UTF-8 string, 6 bytes
                        hex"50", shares,    // 16 bytes
                    hex"67", "receipt",     // UTF-8 string, 7 bytes
                        hex"1b", receiptId  // 64bit unsigned int
            )
        ));
        require(success);

        (uint64 status, bytes memory result) = abi.decode(data, (uint64, bytes));
        if (status != 0) {
            revert SubcallFailed(status, result);
        }

        delegations[msg.sender][from] -= shares;
        pendingUndelegations[receiptId] = PendingUndelegation(from, payable(msg.sender), shares, 0);

        return receiptId;
    }

    function undelegateStart(uint64 receiptId)
        public
    {
        require( receiptId != 0 );

        PendingUndelegation memory pending = pendingUndelegations[receiptId];
        require(pending.to != address(0), "unknown receipt");

        bytes memory result = _takeReceipt(RECEIPT_KIND_UNDELEGATE_START, receiptId);

        // This is a very lazy CBOR decoder. It assumes that if there are only an epoch and receipt fields
        // then the undelegation operation succeeded and if not, there was some sort of error which is not
        // decoded.

        if (result[0] == 0xA2 && result[1] == 0x65 && result[2] == "e" && result[3] == "p") {
            // Undelegation started, decode end epoch (only supported up to epoch 255).
            uint64 epoch = 0;
            uint8 fieldOffset = 7;
            uint8 epochLow = uint8(result[fieldOffset]) & 0x1f;
            if (epochLow <= 23) {
                epoch = uint64(epochLow);
                fieldOffset++;
            } else if (epochLow == 24) {
                epoch = uint64(uint8(result[fieldOffset + 1]));
                fieldOffset += 2;
                require(epoch >= 24, "malformed epoch in receipt");
            } else {
                // A real implementation would support decoding bigger epoch numbers.
                revert("unsupported epoch length");
            }

            // Decode end receipt identifier.
            require(result[fieldOffset] == 0x67 && result[fieldOffset + 1] == "r", "malformed receipt");
            uint8 endReceipt = uint8(result[fieldOffset + 8]) & 0x1f; // Assume end receipt is never greater than 23.

            pendingUndelegations[receiptId].endReceiptId = endReceipt;
            undelegationPools[endReceipt].totalShares += pending.shares;
        }
        else {
            // Undelegation failed to start, return the shares.
            revert ParseReceiptError(receiptId);
        }
    }

    function undelegateDone(uint64 receiptId)
        public
    {
        require( receiptId != 0 );

        PendingUndelegation memory pending = pendingUndelegations[receiptId];
        require(pending.to != address(0), "unknown receipt");
        require(pending.endReceiptId > 0, "must call undelegateStart first");

        UndelegationPool memory pool = undelegationPools[pending.endReceiptId];
        if (pool.totalAmount == 0) {
            // Did not fetch the end receipt yet, do it now.
            bytes memory result = _takeReceipt(RECEIPT_KIND_UNDELEGATE_DONE, pending.endReceiptId);

            // This is a very lazy CBOR decoder. It assumes that if there is only an amount field then
            // the undelegation operation succeeded and if not, there was some sort of error which is
            // not decoded.
            uint128 amount = 0;
            if (result[0] == 0xA1 && result[1] == 0x66 && result[2] == "a") {
                // Undelegation succeeded, decode token amount.
                uint8 amountLen = uint8(result[8]) & 0x1f; // Assume amount field is never greater than 16 bytes.
                for (uint offset = 0; offset < amountLen; offset++) {
                    uint8 v = uint8(result[9 + offset]);
                    amount += uint128(v) << 8*uint128(amountLen - offset - 1);
                }

                undelegationPools[pending.endReceiptId].totalAmount = amount;
                pool.totalAmount = amount;
            } else {
                // Should never fail.
                revert ParseReceiptError(receiptId);
            }
        }

        // Compute how much we get from the pool and transfer the amount.
        uint128 transferAmount = (pending.shares * pool.totalAmount) / pool.totalShares;
        pending.to.transfer(transferAmount);

        delete pendingUndelegations[receiptId];
    }
}
