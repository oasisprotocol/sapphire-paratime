// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {DateTime} from "./DateTime.sol";

struct ParsedSiweMessage {
    bytes schemeDomain;
    address addr;
    bytes statement;
    bytes uri;
    bytes version;
    uint256 chainId;
    bytes nonce;
    bytes issuedAt;
    bytes expirationTime;
    bytes notBefore;
    bytes requestId;
    bytes[] resources;
}

/**
 * @title On-chain parser for EIP-4361 SIWE message
 * @notice Call parseSiweMsg() and provide the EIP-4361 SIWE message. The parser
 * will generate the ParsedSiweMessage struct which you can then use to
 * extract the authentication information in your on-chain contract.
 */
library SiweParser {
    /// Invalid length of the hex-encoded address
    error InvalidAddressLength();
    /// Invalid length of the nonce
    error InvalidNonce();

    /**
     * @notice Convert string containing hex address without 0x prefix to solidity address object.
     */
    function _hexStringToAddress(bytes memory s)
        internal
        pure
        returns (address)
    {
        if (s.length != 40) {
            revert InvalidAddressLength();
        }

        bytes memory r = new bytes(s.length / 2);
        for (uint256 i = 0; i < s.length / 2; ++i) {
            r[i] = bytes1(
                _fromHexChar(uint8(s[2 * i])) *
                    16 +
                    _fromHexChar(uint8(s[2 * i + 1]))
            );
        }
        return address(bytes20(r));
    }

    function _fromHexChar(uint8 c) internal pure returns (uint8) {
        if (bytes1(c) >= bytes1("0") && bytes1(c) <= bytes1("9")) {
            return c - uint8(bytes1("0"));
        }
        if (bytes1(c) >= bytes1("a") && bytes1(c) <= bytes1("f")) {
            return 10 + c - uint8(bytes1("a"));
        }
        if (bytes1(c) >= bytes1("A") && bytes1(c) <= bytes1("F")) {
            return 10 + c - uint8(bytes1("A"));
        }
        return 0;
    }

    /**
     * @notice Substring.
     */
    function _substr(
        bytes memory str,
        uint256 startIndex,
        uint256 endIndex
    ) internal pure returns (bytes memory) {
        bytes memory result = new bytes(endIndex - startIndex);
        for (uint256 i = startIndex; i < endIndex && i < str.length; i++) {
            result[i - startIndex] = str[i];
        }
        return result;
    }

    /**
     * @notice String to Uint using decimal format. No error handling.
     */
    function _parseUint(bytes memory b) internal pure returns (uint256) {
        uint256 result = 0;
        for (uint256 i = 0; i < b.length; i++) {
            result = result * 10 + (uint256(uint8(b[i])) - 0x30);
        }
        return (result);
    }

    /**
     * @notice Parse "NAME: VALUE" in str starting at index i and ending at \n or end of bytes.
     * @return VALUE and new i, if NAME matched; otherwise empty value and old i.
     */
    function _parseField(
        bytes calldata str,
        string memory name,
        uint256 i
    ) internal pure returns (bytes memory, uint256) {
        uint256 j = i;
        for (; j < str.length; j++) {
            if (str[j] == ":") {
                // Delimiter found, check the name.
                if (keccak256(_substr(str, i, j)) != keccak256(bytes(name))) {
                    return ("", i);
                }

                // Skip :
                j++;
                if (j < str.length && str[j] == " ") {
                    // Skip blank
                    j++;
                }

                i = j;
                break;
            }
        }

        for (; j < str.length; j++) {
            if (str[j] == 0x0a) {
                return (_substr(str, i, j), j + 1);
            }
        }
        return (_substr(str, i, j), j);
    }

    /**
     * @notice Parse bullets, one per line in str starting at i.
     * @return Array of parsed values and a new i.
     */
    function _parseArray(bytes calldata str, uint256 i)
        internal
        pure
        returns (bytes[] memory, uint256)
    {
        // First count the number of resources.
        uint256 j = i;
        uint256 count = 0;
        for (; j < str.length - 1; j++) {
            if (str[j] == "-" && str[j + 1] == " ") {
                j += 2;
                count++;
            } else {
                break;
            }
            while (j < str.length && str[j] != 0x0a) {
                j++;
            }
        }

        // Then build an array.
        bytes[] memory values = new bytes[](count);
        j = i;
        for (uint256 c = 0; j < str.length - 1 && c != count; j++) {
            if (str[j] == "-" && str[j + 1] == " ") {
                i = j + 2;
            }
            while (j < str.length && str[j] != 0x0a) {
                j++;
            }
            values[c] = _substr(str, i, j);
            c++;
            if (j == str.length) {
                j--; // Subtract 1 because of the outer loop.
            }
        }
        return (values, j);
    }

    /**
     * @notice Parse SIWE message.
     * @return ParsedSiweMessage struct with populated fields from the message.
     */
    function parseSiweMsg(bytes calldata siweMsg)
        internal
        pure
        returns (ParsedSiweMessage memory)
    {
        ParsedSiweMessage memory p;
        uint256 i = 0;

        // dApp Domain.
        for (; i < siweMsg.length; i++) {
            if (siweMsg[i] == " ") {
                p.schemeDomain = _substr(siweMsg, 0, i);
                break;
            }
        }

        i += 50; // " wants you to sign in with your Ethereum account:\n"

        // Address.
        // TODO: Verify the mixed-case checksum.
        p.addr = _hexStringToAddress(_substr(siweMsg, i += 2, i += 40));
        i += 2; // End of address new line + New line.

        // (Optional) statement.
        if (i < siweMsg.length && siweMsg[i] != "\n") {
            for (uint256 j = i; j < siweMsg.length; j++) {
                if (siweMsg[j] == 0x0a) {
                    p.statement = _substr(siweMsg, i, j);
                    i = j + 1; // End of statement new line.
                    break;
                }
            }
        }

        i++; // New line.

        (p.uri, i) = _parseField(siweMsg, "URI", i);
        (p.version, i) = _parseField(siweMsg, "Version", i);
        bytes memory chainId;
        (chainId, i) = _parseField(siweMsg, "Chain ID", i);
        p.chainId = _parseUint(chainId);
        (p.nonce, i) = _parseField(siweMsg, "Nonce", i);
        if (p.nonce.length < 8) {
            revert InvalidNonce();
        }
        (p.issuedAt, i) = _parseField(siweMsg, "Issued At", i);
        (p.expirationTime, i) = _parseField(siweMsg, "Expiration Time", i);
        (p.notBefore, i) = _parseField(siweMsg, "Not Before", i);
        (p.requestId, i) = _parseField(siweMsg, "Request ID", i);

        // Parse resources, if they exist.
        uint256 newI;
        (, newI) = _parseField(siweMsg, "Resources", i);
        if (newI != i) {
            (p.resources, i) = _parseArray(siweMsg, newI);
        }

        return p;
    }

    /**
     * @notice Parse RFC 3339 (ISO 8601) string to timestamp.
     */
    function timestampFromIso(bytes memory str)
        internal
        pure
        returns (uint256)
    {
        return
            DateTime.toTimestamp(
                uint16(_parseUint(_substr(str, 0, 4))),
                uint8(_parseUint(_substr(str, 5, 7))),
                uint8(_parseUint(_substr(str, 8, 10))),
                uint8(_parseUint(_substr(str, 11, 13))),
                uint8(_parseUint(_substr(str, 14, 16))),
                uint8(_parseUint(_substr(str, 17, 19)))
            );
    }
}
