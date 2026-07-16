// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import {Subcall} from "./Subcall.sol";

/**
 * @title Upgradeable base contract for ROFL-authenticated access control
 * @notice Upgradeable counterpart of [`ROFLable`](../ROFLable.sol/abstract.ROFLable.md).
 * Provides the `onlyROFL` modifier, restricting calls to transactions signed by
 * an authorized instance of a specific ROFL app.
 *
 * #### Example
 *
 * ```solidity
 * contract MyContract is ROFLableUpgradeable {
 *   function initialize(bytes21 inRoflAppId) public initializer {
 *     __ROFLable_init(inRoflAppId);
 *   }
 *
 *   function setPrice(uint128 price) external onlyROFL {
 *     ...
 *   }
 * }
 * ```
 */
abstract contract ROFLableUpgradeable is Initializable {
    /// @custom:storage-location erc7201:oasisprotocol.storage.ROFLable
    struct ROFLableStorage {
        bytes21 _roflAppId;
    }

    // keccak256(abi.encode(uint256(keccak256("oasisprotocol.storage.ROFLable")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant ROFLableStorageLocation =
        0x8940e4963ccaa2197d6e961909d33623c50bf1e108e975034323ec0eeeb65700;

    function _getROFLableStorage()
        private
        pure
        returns (ROFLableStorage storage $)
    {
        assembly {
            $.slot := ROFLableStorageLocation
        }
    }

    event RoflAppIdUpdated(
        bytes21 indexed previousRoflAppId,
        bytes21 indexed newRoflAppId
    );

    /**
     * @notice Initializes the contract, authorizing the given ROFL app.
     * @param initialRoflAppId ROFL app ID.
     */
    function __ROFLable_init(bytes21 initialRoflAppId)
        internal
        onlyInitializing
    {
        __ROFLable_init_unchained(initialRoflAppId);
    }

    function __ROFLable_init_unchained(bytes21 initialRoflAppId)
        internal
        onlyInitializing
    {
        _setRoflAppId(initialRoflAppId);
    }

    /**
     * @notice Reverts unless the transaction is signed by an authorized
     * instance of the configured ROFL app.
     */
    modifier onlyROFL() {
        _checkRoflAppId();
        _;
    }

    /**
     * @notice Returns the currently authorized ROFL app ID.
     */
    function roflAppId() public view virtual returns (bytes21) {
        ROFLableStorage storage $ = _getROFLableStorage();
        return $._roflAppId;
    }

    /**
     * @notice Updates the authorized ROFL app ID. Callable only by the
     * currently authorized ROFL app.
     */
    function setRoflAppId(bytes21 newRoflAppId) public virtual onlyROFL {
        _setRoflAppId(newRoflAppId);
    }

    /**
     * @notice Reverts unless the transaction is signed by an authorized
     * instance of the configured ROFL app.
     */
    function _checkRoflAppId() internal view virtual {
        Subcall.roflEnsureAuthorizedOrigin(roflAppId());
    }

    /**
     * @notice Updates the authorized ROFL app ID. Internal, without access
     * restriction - gate calls to this with your own access control (e.g.
     * `onlyOwner`) when exposing it externally.
     */
    function _setRoflAppId(bytes21 newRoflAppId) internal virtual {
        ROFLableStorage storage $ = _getROFLableStorage();
        bytes21 previousRoflAppId = $._roflAppId;
        $._roflAppId = newRoflAppId;
        emit RoflAppIdUpdated(previousRoflAppId, newRoflAppId);
    }
}
