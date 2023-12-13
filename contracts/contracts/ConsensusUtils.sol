// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import {sha512_256, Sapphire} from "./Sapphire.sol";

/// 21 byte version-prefixed address (1 byte version, 20 bytes truncated digest).
type StakingAddress is bytes21;

/// 32 byte secret key.
type StakingSecretKey is bytes32;

/**
 * @title Consensus-level utilities
 * @notice Generate Oasis wallets for use with staking at the consensus level.
 */
library ConsensusUtils {
    /**
     * @notice The unique context for v0 staking account addresses.
     * @custom:see @oasisprotocol/oasis-core :: go/staking/api/address.go
     */
    string private constant ADDRESS_V0_CONTEXT_IDENTIFIER =
        "oasis-core/address: staking";
    uint8 private constant ADDRESS_V0_CONTEXT_VERSION = 0;

    /**
     * @notice Generate a random Ed25519 wallet for Oasis consensus-layer
     * staking.
     * @param personalization Optional user-specified entropy.
     * @return publicAddress Public address of the keypair.
     * @return secretKey Secret key for the keypair.
     */
    function generateStakingAddress(bytes memory personalization)
        internal
        view
        returns (StakingAddress publicAddress, StakingSecretKey secretKey)
    {
        bytes memory sk = Sapphire.randomBytes(32, personalization);

        (bytes memory pk, ) = Sapphire.generateSigningKeyPair(
            Sapphire.SigningAlg.Ed25519Oasis,
            sk
        );

        publicAddress = StakingAddress.wrap(
            _stakingAddressFromPublicKey(bytes32(pk))
        );

        secretKey = StakingSecretKey.wrap(bytes32(sk));
    }

    /**
     * @notice Derive the staking address from the public key.
     * @param ed25519publicKey Ed25519 public key.
     */
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

    /**
     * @notice Derive an Oasis-style address.
     * @param contextIdentifier Domain separator.
     * @param contextVersion Domain version.
     * @param data Public point of the keypair.
     */
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
