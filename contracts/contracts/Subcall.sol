// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import {StakingAddress, StakingSecretKey} from "./ConsensusUtils.sol";
import "./CBOR.sol" as CBOR;

enum SubcallReceiptKind {
    Invalid,
    Delegate,
    UndelegateStart,
    UndelegateDone
}

/**
 * @title SDK Subcall wrappers
 * @notice Interact with Oasis Runtime SDK modules from Sapphire.
 */
library Subcall {
    // Consensus
    string private constant CONSENSUS_DELEGATE = "consensus.Delegate";
    string private constant CONSENSUS_UNDELEGATE = "consensus.Undelegate";
    string private constant CONSENSUS_WITHDRAW = "consensus.Withdraw";
    string private constant CONSENSUS_TAKE_RECEIPT = "consensus.TakeReceipt";
    // Accounts
    string private constant ACCOUNTS_TRANSFER = "accounts.Transfer";
    // Core
    string private constant CORE_CALLDATAPUBLICKEY = "core.CallDataPublicKey";
    string private constant CORE_CURRENT_EPOCH = "core.CurrentEpoch";
    // ROFL
    string private constant ROFL_IS_AUTHORIZED_ORIGIN =
        "rofl.IsAuthorizedOrigin";

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

    /// Expected map of different size!
    error WrongMapSizeError();

    /// Unknown type of receipt!
    error TakeReceiptKindOutOfRange(uint256 receiptKind);

    /// The origin is not authorized for the given ROFL app
    error RoflOriginNotAuthorizedForApp();

    /// Name of token cannot be CBOR encoded with current functions
    error TokenNameTooLong();

    /// Invalid receipt ID
    error InvalidReceiptId();

    /// CBOR parser expected a key, but it was not found in the map!
    error MissingKey();

    /// We expected to have parsed everything, but there are excess bytes!
    error IncompleteParse();

    /// Error while trying to retrieve current epoch
    error CoreCurrentEpochError(uint64);

    /// Error while trying to retrieve the calldata public key
    error CoreCallDataPublicKeyError(uint64);

    /**
     * @notice Submit a native message to the Oasis runtime layer. Messages
     * which re-enter the EVM module are forbidden: `evm.*`.
     * @param method Native message type.
     * @param body CBOR encoded body.
     * @return status Result of call.
     * @return data CBOR encoded result.
     */
    function subcall(string memory method, bytes memory body)
        internal
        returns (uint64 status, bytes memory data)
    {
        (bool success, bytes memory tmp) = SUBCALL.call( // solhint-disable-line
            abi.encode(method, body)
        );

        if (!success) {
            revert SubcallError();
        }

        (status, data) = abi.decode(tmp, (uint64, bytes));
    }

    /**
     * @notice Submit a read-only native message to the Oasis runtime layer using STATICCALL.
     * Messages which re-enter the EVM module are forbidden: `evm.*`.
     * @param method Native message type.
     * @param body CBOR encoded body.
     * @return status Result of call.
     * @return data CBOR encoded result.
     */
    function subcall_static(string memory method, bytes memory body)
        internal
        view
        returns (uint64 status, bytes memory data)
    {
        (bool success, bytes memory tmp) = SUBCALL.staticcall(
            abi.encode(method, body)
        );

        if (!success) {
            revert SubcallError();
        }

        (status, data) = abi.decode(tmp, (uint64, bytes));
    }

    /**
     * @notice Generic method to call `{to:address, amount:uint128}`.
     * @param method Runtime SDK method name ('module.Action').
     * @param to Destination address.
     * @param value Amount specified.
     * @return status Non-zero on error.
     * @return data Module name on error.
     */
    function _subcallWithToAndAmount(
        string memory method,
        StakingAddress to,
        uint128 value,
        bytes memory token
    ) internal returns (uint64 status, bytes memory data) {
        // Ensures prefix is in range of 0x40..0x57 (inclusive)
        if (token.length > 19) revert TokenNameTooLong();

        (status, data) = subcall(
            method,
            abi.encodePacked( // CBOR encoded, {to: to, amount: [value, token]}
                hex"a262", // map, 2 pairs + UTF-8 string, 2 byte
                "to",
                hex"55", // byte string, 21 bytes
                to,
                hex"66", // UTF-8 string, 6 bytes
                "amount",
                hex"8250", // Array, 2 elements + byte string, 16 bytes
                value,
                uint8(0x40 + token.length), // byte string, 0+token.length bytes
                token
            )
        );
    }

    /**
     * @notice Returns a CBOR encoded structure, containing the following
     * possible keys. All keys are optional:
     *
     *  - shares: `u128`
     *  - epoch: `EpochTime`
     *  - receipt: `u64`
     *  - amount: `u128`
     *  - error: `{module: string, code: u32}`
     *
     * #### Keys returned by specific subcalls
     *
     * - `Delegate` will have the `error` or `shares` keys.
     * - `UndelegateStart` will have the `epoch` and `receipt` keys.
     * - `UndelegateDone` will have the `amount` key.
     *
     * @param kind `1` (`Delegate`), `2` (`UndelegateStart`) or `3` (`UndelegateDone`)
     * @param receiptId ID of receipt
     */
    function consensusTakeReceipt(SubcallReceiptKind kind, uint64 receiptId)
        internal
        returns (bytes memory)
    {
        if (receiptId == 0) revert InvalidReceiptId();

        if (uint256(kind) == 0 || uint256(kind) > 23)
            revert TakeReceiptKindOutOfRange(uint256(kind));

        (bool success, bytes memory data) = SUBCALL.call( // solhint-disable-line
            abi.encode(
                CONSENSUS_TAKE_RECEIPT,
                abi.encodePacked( // CBOR encoded, {'id': x, 'kind': y}
                    hex"a2", // Map, 2 pairs
                    hex"62", // UTF-8 string, 2 bytes
                    "id", // Byte string, 2 bytes
                    hex"1b",
                    receiptId, // Unsigned 64bit integer
                    hex"64",
                    "kind", // Byte string, 4 bytes
                    uint8(kind) // uint8 <= 23.
                )
            )
        );

        if (!success) revert SubcallError();

        (uint64 status, bytes memory result) = abi.decode(
            data,
            (uint64, bytes)
        );

        // 0xf6 = null, returns null in case receiptId not found
        if (result[0] == 0xf6) {
            revert InvalidReceiptId();
        }

        if (status != 0) {
            revert ConsensusTakeReceiptError(status, string(result));
        }

        return result;
    }

    function _decodeReceiptUndelegateStart(bytes memory result)
        internal
        pure
        returns (uint64 epoch, uint64 endReceipt)
    {
        uint256 offset = 1;

        bool hasEpoch = false;

        bool hasReceipt = false;

        // Expects map with 2 pairs
        if (result[0] != 0xA2) revert WrongMapSizeError();

        while (offset < result.length) {
            bytes32 keyDigest;

            (offset, keyDigest) = CBOR.parseKey(result, offset);

            if (keyDigest == keccak256("epoch")) {
                (offset, epoch) = CBOR.parseUint64(result, offset);

                hasEpoch = true;
            } else if (keyDigest == keccak256("receipt")) {
                (offset, endReceipt) = CBOR.parseUint64(result, offset);

                hasReceipt = true;
            }
        }

        if (!hasEpoch || !hasReceipt) revert MissingKey();
    }

    function _decodeReceiptUndelegateDone(bytes memory result)
        internal
        pure
        returns (uint128 amount)
    {
        uint256 offset = 1;

        bool hasAmount = false;

        // Expects map with 1 pair
        if (result[0] != 0xA1) revert WrongMapSizeError();

        while (offset < result.length) {
            bytes32 keyDigest;

            (offset, keyDigest) = CBOR.parseKey(result, offset);

            if (keyDigest == keccak256("amount")) {
                (offset, amount) = CBOR.parseUint128(result, offset);

                hasAmount = true;
            }
        }

        if (!hasAmount) revert MissingKey();
    }

    /**
     * @notice Decodes a 'Delegate' receipt.
     * @param receiptId Previously unretrieved receipt.
     * @param result CBOR encoded {shares: u128}.
     */
    function _decodeReceiptDelegate(uint64 receiptId, bytes memory result)
        internal
        pure
        returns (uint128 shares)
    {
        // Expects map with 1 pair
        if (result[0] != 0xA1) revert WrongMapSizeError();

        if (result[0] == 0xA1 && result[1] == 0x66 && result[2] == "s") {
            // Delegation succeeded, decode number of shares.
            uint256 newOffset;
            (newOffset, shares) = CBOR.parseUint128(result, 8);
            if (newOffset != result.length) {
                revert IncompleteParse();
            }
        } else {
            revert ParseReceiptError(receiptId);
        }
    }

    function consensusTakeReceiptDelegate(uint64 receiptId)
        internal
        returns (uint128 shares)
    {
        bytes memory result = consensusTakeReceipt(
            SubcallReceiptKind.Delegate,
            receiptId
        );

        shares = _decodeReceiptDelegate(receiptId, result);
    }

    function consensusTakeReceiptUndelegateStart(uint64 receiptId)
        internal
        returns (uint64 epoch, uint64 endReceipt)
    {
        bytes memory result = consensusTakeReceipt(
            SubcallReceiptKind.UndelegateStart,
            receiptId
        );

        (epoch, endReceipt) = _decodeReceiptUndelegateStart(result);
    }

    function consensusTakeReceiptUndelegateDone(uint64 receiptId)
        internal
        returns (uint128 amount)
    {
        bytes memory result = consensusTakeReceipt(
            SubcallReceiptKind.UndelegateDone,
            receiptId
        );

        (amount) = _decodeReceiptUndelegateDone(result);
    }

    /**
     * @notice Start the undelegation process of the given number of shares from
     * consensus staking account to runtime account.
     * @param from Consensus address which shares were delegated to.
     * @param shares Number of shares to withdraw back to us.
     */
    function consensusUndelegate(StakingAddress from, uint128 shares) internal {
        (uint64 status, bytes memory data) = subcall(
            CONSENSUS_UNDELEGATE,
            abi.encodePacked( // CBOR encoded, {'from': x, 'shares': y}
                hex"a2", // map, 2 pairs
                // pair 1
                hex"64", // UTF-8 string, 4 bytes
                "from",
                hex"55", // 21 bytes
                from,
                // pair 2
                hex"66", // UTF-8 string, 6 bytes
                "shares",
                hex"50", // 128bit unsigned int (16 bytes)
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
    ) internal {
        // XXX: due to weirdness in oasis-cbor, `0x1b || 8 bytes` requires `value >= 2**32`
        if (receiptId < 4294967296) revert InvalidReceiptId();

        (uint64 status, bytes memory data) = subcall(
            CONSENSUS_UNDELEGATE,
            abi.encodePacked( // CBOR encoded, {'from': x, 'shares': y, 'receipt': z}
                hex"a3", // map, 3 pairs
                // pair 1
                hex"64", // UTF-8 string, 4 bytes
                "from",
                hex"55", // 21 bytes
                from,
                // pair 2
                hex"66", // UTF-8 string, 6 bytes
                "shares",
                hex"50", // 16 bytes
                shares,
                // pair 3
                hex"67", // UTF-8 string, 7 bytes
                "receipt",
                hex"1b", // 64bit unsigned int
                receiptId
            )
        );

        if (status != 0) {
            revert ConsensusUndelegateError(status, string(data));
        }
    }

    /**
     * @notice Delegate native token to consensus level.
     * @param to Consensus address shares are delegated to.
     * @param amount Native token amount (in wei).
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
     * @notice Delegate native token to consensus level. Requests that the
     * number of shares allocated can be retrieved with a receipt. The receipt
     * will be of `ReceiptKind.DelegateDone` and can be decoded using
     * `decodeReceiptDelegateDone`.
     * @param to Consensus address shares are delegated to.
     * @param amount Native token amount (in wei).
     * @param receiptId contract-specific receipt to retrieve result.
     */
    function consensusDelegate(
        StakingAddress to,
        uint128 amount,
        uint64 receiptId
    ) internal returns (bytes memory data) {
        // XXX: due to weirdness in oasis-cbor, `0x1b || 8 bytes` requires `value >= 2**32`
        if (receiptId < 4294967296) revert InvalidReceiptId();

        uint64 status;

        (status, data) = subcall(
            CONSENSUS_DELEGATE,
            abi.encodePacked( // CBOR encoded, {to: to, amount: [amount, token], receipt: receiptId}
                hex"a3", // map, 3 pairs
                // pair 1
                hex"62", // UTF-8 string, 2 byte
                "to",
                hex"55", // byte string, 21 bytes
                to,
                // pair 2
                hex"66", // UTF-8 string, 6 bytes
                "amount",
                hex"82", // Array, 2 elements
                hex"50", // byte string, 16 bytes
                amount,
                // TODO: handle non-native token!
                hex"40", // byte string, 0 bytes
                // pair 3
                hex"67", // UTF-8 string, 7 bytes
                "receipt",
                hex"1b", // uint64, 8 bytes
                receiptId
            )
        );

        if (status != 0) {
            revert ConsensusDelegateError(status, string(data));
        }
    }

    /**
     * @notice Transfer from an account in this runtime to a consensus staking
     * account.
     * @param to Consensus address which gets the tokens.
     * @param value Token amount (in wei).
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
     * @notice Perform a transfer to another account. This is equivalent of
     * `payable(to).transfer(value);`.
     * @param to Destination account.
     * @param value native token amount (in wei).
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

    /**
     * @notice Verify whether the origin transaction is signed by an authorized
     * ROFL instance for the given application.
     * @param appId ROFL app identifier
     */
    function roflEnsureAuthorizedOrigin(bytes21 appId) internal view {
        (uint64 status, bytes memory data) = subcall_static(
            ROFL_IS_AUTHORIZED_ORIGIN,
            abi.encodePacked(hex"55", appId) // CBOR byte string, 21 bytes.
        );

        // The result should be a CBOR-encoded boolean with the value true indicating
        // that the origin is authorized for the given ROFL app.
        if (status != 0 || data.length != 1 || data[0] != 0xf5) {
            revert RoflOriginNotAuthorizedForApp();
        }
    }

    struct CallDataPublicKey {
        bytes32 key;
        bytes32 checksum;
        bytes32[2] signature;
        uint256 expiration;
    }

    function _parseCBORPublicKeyInner(bytes memory in_data, uint256 in_offset)
        internal
        pure
        returns (uint256 offset, CallDataPublicKey memory public_key)
    {
        uint256 mapLen;

        (mapLen, offset) = CBOR.parseMapStart(in_data, in_offset);

        while (mapLen > 0) {
            mapLen -= 1;

            bytes32 keyDigest;

            (offset, keyDigest) = CBOR.parseKey(in_data, offset);

            if (keyDigest == keccak256("key")) {
                uint256 tmp;
                (offset, tmp) = CBOR.parseUint(in_data, offset);
                public_key.key = bytes32(tmp);
            } else if (keyDigest == keccak256("checksum")) {
                uint256 tmp;
                (offset, tmp) = CBOR.parseUint(in_data, offset);
                public_key.checksum = bytes32(tmp);
            } else if (keyDigest == keccak256("expiration")) {
                (offset, public_key.expiration) = CBOR.parseUint(
                    in_data,
                    offset
                );
            } else if (keyDigest == keccak256("signature")) {
                if (in_data[offset++] != 0x58) {
                    revert CBOR.CBOR_InvalidUintPrefix(
                        uint8(in_data[offset - 1])
                    );
                }
                if (in_data[offset++] != 0x40) {
                    revert CBOR.CBOR_InvalidUintSize(
                        uint8(in_data[offset - 1])
                    );
                }
                uint256 tmp;
                assembly {
                    tmp := mload(add(in_data, add(offset, 0x20)))
                }
                public_key.signature[0] = bytes32(tmp);
                assembly {
                    tmp := mload(add(in_data, add(offset, 0x40)))
                }
                public_key.signature[1] = bytes32(tmp);

                offset += 0x40;
            } else {
                revert CBOR.CBOR_InvalidKey();
            }
        }
    }

    function _parseCBORCallDataPublicKey(bytes memory in_data)
        internal
        pure
        returns (uint256 epoch, CallDataPublicKey memory public_key)
    {
        (uint256 outerMapLen, uint256 offset) = CBOR.parseMapStart(in_data, 0);

        while (outerMapLen > 0) {
            bytes32 keyDigest;

            outerMapLen -= 1;

            (offset, keyDigest) = CBOR.parseKey(in_data, offset);

            if (keyDigest == keccak256("epoch")) {
                (offset, epoch) = CBOR.parseUint(in_data, offset);
            } else if (keyDigest == keccak256("public_key")) {
                (offset, public_key) = _parseCBORPublicKeyInner(
                    in_data,
                    offset
                );
            } else {
                revert CBOR.CBOR_InvalidKey();
            }
        }
    }

    // core.CallDataPublicKey
    function coreCallDataPublicKey()
        internal
        view
        returns (uint256 epoch, CallDataPublicKey memory public_key)
    {
        (uint64 status, bytes memory data) = subcall_static(
            CORE_CALLDATAPUBLICKEY,
            hex"f6" // null
        );

        if (status != 0) {
            revert CoreCallDataPublicKeyError(status);
        }

        return _parseCBORCallDataPublicKey(data);
    }

    // core.CurrentEpoch
    function coreCurrentEpoch() internal view returns (uint256) {
        (uint64 status, bytes memory data) = subcall_static(
            CORE_CURRENT_EPOCH,
            hex"f6" // null
        );

        if (status != 0) {
            revert CoreCurrentEpochError(status);
        }

        (, uint256 result) = CBOR.parseUint(data, 0);

        return result;
    }
}
