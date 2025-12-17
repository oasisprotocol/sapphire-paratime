// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Sapphire} from "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

/**
 * @title EncryptedEventsROFL
 * @notice Sketch for a ROFL-friendly encrypted-events flow.
 *
 * IMPORTANT: This is a sketch. Do **not** deploy this contract as-is.
 */
contract EncryptedEventsROFL {
    event Encrypted(address indexed sender, bytes32 nonce, bytes ciphertext);

    // Replace this with a real ROFL/OPL authorization scheme (e.g., allowlist,
    // appd/attestation checks, marketplace-managed identities, etc.).
    address public roflApp; // set to your ROFL app's address in your deployment flow

    modifier onlyROFL() {
        require(msg.sender == roflApp, "only ROFL app");
        _;
    }

    function emitWithOnchainKey(bytes calldata text) external onlyROFL {
        // 1) Generate a fresh symmetric key on-chain (per call or per session)
        bytes32 key = bytes32(Sapphire.randomBytes(32, bytes("rofl:onchain:key")));

        // 2) Encrypt with optional context-binding AAD
        bytes32 nonce = bytes32(Sapphire.randomBytes(32, bytes("rofl:nonce")));
        bytes memory ad = abi.encodePacked(block.chainid, address(this));
        bytes memory encrypted = Sapphire.encrypt(key, nonce, text, ad);

        // 3) Emit
        emit Encrypted(msg.sender, nonce, encrypted);

        // Optionally: persist or wrap `key` for ROFL retrieval using your chosen scheme.
        // Do NOT emit or log secrets in production.
    }
}
