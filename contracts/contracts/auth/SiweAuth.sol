// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Strings.sol";

import { SignatureRSV, A13e } from "./A13e.sol";
import { ParsedSiweMessage, SiweParser } from "../SiweParser.sol";
import "../Sapphire.sol";

struct Bearer {
    string domain; // [ scheme "://" ] domain.
    address userAddr;
    uint256 validUntil; // in Unix timestamp.
}

/**
 * @title Base contract for SIWE-based authentication
 * @notice Inherit this contract, if you wish to enable SIWE-based
 * authentication for your contract methods that require authenticated calls.
 * The smart contract needs to be bound to a domain (passed in constructor).
 *
 * #### Example
 *
 * ```solidity
 * contract MyContract is SiweAuth {
 *   address private _owner;
 *
 *   modifier onlyOwner(bytes calldata bearer) {
 *     if (authMsgSender(bearer) != author) {
 *       revert("not allowed");
 *     }
 *     _;
 *   }
 *
 *   constructor(string memory domain) SiweAuth(domain) {
 *     _owner = msg.sender;
 *   }
 *
 *   function getSecretMessage(bytes calldata bearer) external view onlyOwner(bearer) returns (string memory) {
 *     return "Very secret message";
 *   }
 * }
 * ```
 */
contract SiweAuth is A13e {
    string _domain;
    bytes32 _bearerEncKey;

    uint constant DEFAULT_VALIDITY=24 hours; // in seconds.

    constructor(string memory in_domain) {
        _bearerEncKey = bytes32(Sapphire.randomBytes(32, ""));
        _domain = in_domain;
    }

    function login(string calldata siweMsg, SignatureRSV calldata sig) override external view returns (bytes memory) {
        Bearer memory b;

        // Derive the user's address from the signature.
        bytes memory eip191msg = abi.encodePacked("\x19Ethereum Signed Message:\n", Strings.toString(bytes(siweMsg).length), siweMsg);
        address addr = ecrecover(keccak256(eip191msg), uint8(sig.v), sig.r, sig.s);
        b.userAddr = addr;

        ParsedSiweMessage memory p = SiweParser.parseSiweMsg(bytes(siweMsg));

        require(p.chainId==block.chainid, "chain ID mismatch");

        require(keccak256(p.schemeDomain)==keccak256(bytes(_domain)), "domain mismatch");
        b.domain = string(p.schemeDomain);

        require(p.addr==addr, "SIWE address does not match signer's address");

        if (p.notBefore.length!=0) {
            require(block.timestamp > SiweParser.timestampFromIso(p.notBefore), "not before not reached yet");
        }

        if (p.expirationTime.length!=0) {
            // Compute expected block number at expiration time.
            uint expirationTime = SiweParser.timestampFromIso(p.expirationTime);
            b.validUntil = expirationTime;
        } else {
            // Otherwise, just take the default validity.
            b.validUntil = block.timestamp + DEFAULT_VALIDITY;
        }
        require(block.timestamp < b.validUntil, "expired");

        bytes memory encB = Sapphire.encrypt(_bearerEncKey, 0, abi.encode(b), "");
        return encB;
    }

    /**
      * @notice Return the domain associated with the dApp.
      */
    function domain() public view returns (string memory) {
        return _domain;
    }

    function authMsgSender(bytes calldata bearer) override internal view returns (address) {
        bytes memory bearerEncoded = Sapphire.decrypt(_bearerEncKey, 0, bearer, "");
        Bearer memory b = abi.decode(bearerEncoded, (Bearer));
        require(keccak256(bytes(b.domain))==keccak256(bytes(_domain)), "invalid domain");
        require(b.validUntil>=block.timestamp, "expired");
        return b.userAddr;
    }
}
