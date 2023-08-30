// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import {sha512_256, Sapphire} from "./Sapphire.sol";

type StakingPublicKey is bytes21;

type StakingSecretKey is bytes32;

library ConsensusUtils {
    string constant private ADDRESS_V0_CONTEXT_IDENTIFIER = "oasis-core/address: staking";
    uint8 constant private ADDRESS_V0_CONTEXT_VERSION = 0;

    string constant internal V0_SECP256K1ETH_CONTEXT_IDENTIFIER = "oasis-runtime-sdk/address: secp256k1eth";
    uint8 constant internal V0_SECP256K1ETH_CONTEXT_VERSION = 0;

    function generateStakingAddress(bytes memory personalization)
        internal view
        returns (StakingPublicKey publicKey, StakingSecretKey secretKey)
    {
        bytes memory sk = Sapphire.randomBytes(32, personalization);

        (bytes memory pk,) = Sapphire.generateSigningKeyPair(
            Sapphire.SigningAlg.Ed25519Oasis, sk);

        publicKey = StakingPublicKey.wrap(_stakingAddressFromPublicKey(bytes32(pk)));

        secretKey = StakingSecretKey.wrap(bytes32(sk));
    }

    function _stakingAddressFromPublicKey(bytes32 ed25519publicKey)
        internal view
        returns (bytes21)
    {
        return _addressFromData(
            ADDRESS_V0_CONTEXT_IDENTIFIER,
            ADDRESS_V0_CONTEXT_VERSION,
            abi.encodePacked(ed25519publicKey));
    }

    function _addressFromData(
        string memory contextIdentifier,
        uint8 contextVersion,
        bytes memory data
    )
        internal view
        returns (bytes21)
    {
        return  bytes21(
            abi.encodePacked(
                contextVersion,
                bytes20(
                    sha512_256(
                        abi.encodePacked(
                            contextIdentifier,
                            contextVersion,
                            data)))));
    }
}

library Subcall {
    address internal constant SUBCALL =
        0x0100000000000000000000000000000000000103;

    error Subcall_Error ();

    /**
     * Submit a native message to the Oasis runtime layer
     *
     * Messages which re-enter the EVM module are forbidden: evm.*
     *
     * @param method Native message type
     * @param body CBOR encoded body
     * @return status_code Result of call
     * @return data CBOR encoded result
     */
    function subcall(string memory method, bytes memory body)
        internal
        returns (uint64 status_code, bytes memory data)
    {
        (bool success, bytes memory tmp) = SUBCALL.call(
            abi.encode(method, body)
        );

        if( false == success ) {
            revert Subcall_Error();
        }

        (status_code, data) = abi.decode(tmp, (uint64, bytes));
    }


    error ConsensusUndelegate_Error(uint64 status_code, bytes data);

    function consensus_Undelegate(
        StakingPublicKey from,
        uint128 shares
    )
        internal
    {
        (uint64 status_code, bytes memory data) = subcall(
            "consensus.Undelegate",
            abi.encodePacked(
                hex"a26466726f6d55", from, hex"6673686172657350", shares
            ));

        if( status_code != 0 ) {
            revert ConsensusUndelegate_Error(status_code, data);
        }
    }

    function _subcall_to_amount (
        string memory method,
        StakingPublicKey to,
        uint128 value
    )
        internal
        returns (uint64 status_code, bytes memory data)
    {
        (status_code, data) = subcall(method, abi.encodePacked(
            hex"a262746f55", to, hex"66616d6f756e748250", value, hex"40"
        ));
    }


    error ConsensusDelegate_Error(uint64 status_code, bytes data);

    function consensus_Delegate(StakingPublicKey to, uint128 value)
        internal
    {
        (uint64 status_code, bytes memory data) = _subcall_to_amount("consensus.Delegate", to, value);

        if( status_code != 0 ) {
            revert ConsensusDelegate_Error(status_code, data);
        }
    }


    error ConsensusDeposit_Error(uint64 status_code, bytes data);

    /**
     * Deposit into runtime call.
     *
     * Transfer from consensus staking to an account in this runtime.
     *
     * The transaction signer has a consensus layer allowance benefiting this
     * runtime's staking address.
     *
     * @param to runtime account gets the tokens
     * @param value native token amount
     */
    function consensus_Deposit(StakingPublicKey to, uint128 value)
        internal
    {
        (uint64 status_code, bytes memory data) = _subcall_to_amount("consensus.Deposit", to, value);

        if( status_code != 0 ) {
            revert ConsensusDeposit_Error(status_code, data);
        }
    }


    error ConsensusWithdraw_Error(uint64 status_code, bytes data);

    /**
     * Withdraw from runtime call.
     *
     * Transfer from an account in this runtime to consensus staking.
     *
     * @param to consensus staking account which gets the tokens
     * @param value native token amount
     */
    function consensus_Withdraw(StakingPublicKey to, uint128 value)
        internal
    {
        (uint64 status_code, bytes memory data) = _subcall_to_amount("consensus.Withdraw", to, value);

        if( status_code != 0 ) {
            revert ConsensusDeposit_Error(status_code, data);
        }
    }


    error AccountsTransfer_Error(uint64 status_code, bytes data);

    function accounts_Transfer(StakingPublicKey to, uint128 value)
        internal
    {
        (uint64 status_code, bytes memory data) = _subcall_to_amount("accounts.Transfer", to, value);

        if( status_code != 0 ) {
            revert AccountsTransfer_Error(status_code, data);
        }
    }
}
