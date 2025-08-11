// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Sapphire} from "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

/**
 * @title EncryptedEventsECDH
 * @notice Emits confidential events where the symmetric key is derived on-chain
 *         using X25519 (Curve25519) ECDH between the caller and the contract.
 *
 * Flow:
 *  - On deploy: contract generates a Curve25519 keypair and keeps the secret key in encrypted state.
 *  - Off-chain: caller generates a Curve25519 keypair and sends their public key in the tx.
 *  - On-chain:  key = Sapphire.deriveSymmetricKey(callerPublicKey, contractSecretKey)
 *  - Encrypt + emit: same event shape as the simple example.
 */
contract EncryptedEventsECDH {
    event Encrypted(address indexed sender, bytes32 nonce, bytes ciphertext);

    // Number of random bytes used to construct the 32-byte nonce for Deoxys-II
    uint256 private constant NONCE_SIZE_BYTES = 32;

    // Domain separation tag for nonce generation
    string private constant NONCE_PERS = "EncryptedEvents:nonce";

    // Long‑lived ECDH secret key, stored in confidential Sapphire state.
    Sapphire.Curve25519SecretKey private _contractSk;
    // Public key exposed for clients to derive the shared key off‑chain.
    Sapphire.Curve25519PublicKey public contractPk;

    constructor() {
        bytes memory empty = bytes("");
        (
            Sapphire.Curve25519PublicKey pk,
            Sapphire.Curve25519SecretKey sk
        ) = Sapphire.generateCurve25519KeyPair(empty);
        contractPk = pk;
        _contractSk = sk;
    }

    /// @notice Derives a symmetric key with the caller and emits an encrypted event.
    /// @param callerPublicKey Curve25519 public key of the caller (32 bytes, typed).
    /// @param message         Plaintext message (bytes) to encrypt and emit.
    function emitEncryptedECDH(
        Sapphire.Curve25519PublicKey callerPublicKey,
        bytes calldata message
    ) external {
        // Derive a 32-byte symmetric key via X25519 (ECDH) with the caller.
        bytes32 key = Sapphire.deriveSymmetricKey(callerPublicKey, _contractSk);

        // Encrypt and emit (Deoxys-II uses first 15 bytes of the 32-byte nonce).
        bytes32 nonce = bytes32(
            Sapphire.randomBytes(NONCE_SIZE_BYTES, bytes(NONCE_PERS))
        );
        bytes memory cipher = Sapphire.encrypt(key, nonce, message, bytes(""));
        emit Encrypted(msg.sender, nonce, cipher);
    }

    /// @notice Same as emitEncryptedECDH, but binds encryption to msg.sender via AAD.
    function emitEncryptedECDHWithAad(
        Sapphire.Curve25519PublicKey callerPublicKey,
        bytes calldata message
    ) external {
        bytes32 key = Sapphire.deriveSymmetricKey(callerPublicKey, _contractSk);

        bytes32 nonce = bytes32(
            Sapphire.randomBytes(NONCE_SIZE_BYTES, bytes(NONCE_PERS))
        );
        bytes memory aad = abi.encodePacked(msg.sender);
        bytes memory cipher = Sapphire.encrypt(key, nonce, message, aad);
        emit Encrypted(msg.sender, nonce, cipher);
    }

    /// @notice Same as emitEncryptedECDH, but binds encryption to (chainId, contract) via AAD.
    function emitEncryptedECDHWithContextAad(
        Sapphire.Curve25519PublicKey callerPublicKey,
        bytes calldata message
    ) external {
        bytes32 key = Sapphire.deriveSymmetricKey(callerPublicKey, _contractSk);

        bytes32 nonce = bytes32(
            Sapphire.randomBytes(NONCE_SIZE_BYTES, bytes(NONCE_PERS))
        );
        // AAD = solidityPacked(uint256 chainid, address this)
        bytes memory aad = abi.encodePacked(block.chainid, address(this));
        bytes memory cipher = Sapphire.encrypt(key, nonce, message, aad);
        emit Encrypted(msg.sender, nonce, cipher);
    }
}
