// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import {sha512_256, Sapphire} from "./Sapphire.sol";

type StakingPublicKey is bytes21;

type StakingSecretKey is bytes32;

library ConsensusUtils {
    string private constant ADDRESS_V0_CONTEXT_IDENTIFIER =
        "oasis-core/address: staking";
    uint8 private constant ADDRESS_V0_CONTEXT_VERSION = 0;

    string internal constant V0_SECP256K1ETH_CONTEXT_IDENTIFIER =
        "oasis-runtime-sdk/address: secp256k1eth";
    uint8 internal constant V0_SECP256K1ETH_CONTEXT_VERSION = 0;

    function generateStakingAddress(bytes memory personalization)
        internal
        view
        returns (StakingPublicKey publicKey, StakingSecretKey secretKey)
    {
        bytes memory sk = Sapphire.randomBytes(32, personalization);

        (bytes memory pk, ) = Sapphire.generateSigningKeyPair(
            Sapphire.SigningAlg.Ed25519Oasis,
            sk
        );

        publicKey = StakingPublicKey.wrap(
            _stakingAddressFromPublicKey(bytes32(pk))
        );

        secretKey = StakingSecretKey.wrap(bytes32(sk));
    }

    function _stakingAddressFromPublicKey(bytes32 ed25519publicKey)
        internal
        view
        returns (bytes21)
    {
        return
            _addressFromData(
                ADDRESS_V0_CONTEXT_IDENTIFIER,
                ADDRESS_V0_CONTEXT_VERSION,
                abi.encodePacked(ed25519publicKey)
            );
    }

    function _addressFromData(
        string memory contextIdentifier,
        uint8 contextVersion,
        bytes memory data
    ) internal view returns (bytes21) {
        return
            bytes21(
                abi.encodePacked(
                    contextVersion,
                    bytes20(
                        sha512_256(
                            abi.encodePacked(
                                contextIdentifier,
                                contextVersion,
                                data
                            )
                        )
                    )
                )
            );
    }
}

library Subcall {
    address internal constant SUBCALL =
        0x0100000000000000000000000000000000000103;

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

        if (false == success) {
            revert Subcall_Error();
        }

        (status, data) = abi.decode(tmp, (uint64, bytes));
    }

    function _subcallWithToAndAmount(
        string memory method,
        StakingPublicKey to,
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
     * @param from Public key which shares were delegated to
     * @param shares Number of shares to withdraw back to us
     */
    function consensusUndelegate(StakingPublicKey from, uint128 shares)
        internal
    {
        (uint64 status, bytes memory data) = subcall(
            "consensus.Undelegate",
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
     * @param to Staking account
     * @param value native token amount (in wei)
     */
    function consensusDelegate(StakingPublicKey to, uint128 value) internal {
        (uint64 status, bytes memory data) = _subcallWithToAndAmount(
            "consensus.Delegate",
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
     * @param to consensus staking account which gets the tokens
     * @param value native token amount (in wei)
     */
    function consensusWithdraw(StakingPublicKey to, uint128 value) internal {
        (uint64 status, bytes memory data) = _subcallWithToAndAmount(
            "consensus.Withdraw",
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
            "accounts.Transfer",
            StakingPublicKey.wrap(bytes21(abi.encodePacked(uint8(0x00), to))),
            value
        );

        if (status != 0) {
            revert AccountsTransferError(status, string(data));
        }
    }
}
