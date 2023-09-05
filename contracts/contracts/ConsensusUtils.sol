// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.0;

import {sha512_256, Sapphire} from "./Sapphire.sol";

type StakingPublicKey is bytes21;

type StakingSecretKey is bytes32;

library ConsensusUtils {
    string private constant ADDRESS_V0_CONTEXT_IDENTIFIER =
        "oasis-core/address: staking";
    uint8 private constant ADDRESS_V0_CONTEXT_VERSION = 0;

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
