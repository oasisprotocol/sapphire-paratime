// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {Subcall} from "./Subcall.sol";

/**
 * @title Base contract for ROFL-authenticated access control
 * @notice Provides the `onlyROFL` modifier, restricting calls to
 * transactions signed by an authorized instance of a specific ROFL app.
 *
 * See [`ROFLableUpgradeable`](../ROFLableUpgradeable.sol/abstract.ROFLableUpgradeable.md)
 * for an upgradeable counterpart of this contract.
 *
 * #### Example
 *
 * ```solidity
 * contract MyContract is ROFLable {
 *   constructor(bytes21 inRoflAppId) ROFLable(inRoflAppId) {}
 *
 *   function setPrice(uint128 price) external onlyROFL {
 *     ...
 *   }
 * }
 * ```
 */
abstract contract ROFLable {
    bytes21 private _roflAppId;

    event RoflAppIdUpdated(
        bytes21 indexed previousRoflAppId,
        bytes21 indexed newRoflAppId
    );

    /**
     * @notice Initializes the contract, authorizing the given ROFL app.
     * @param initialRoflAppId ROFL app ID.
     */
    constructor(bytes21 initialRoflAppId) {
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
        return _roflAppId;
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
        Subcall.roflEnsureAuthorizedOrigin(_roflAppId);
    }

    /**
     * @notice Updates the authorized ROFL app ID. Internal, without access
     * restriction - gate calls to this with your own access control (e.g.
     * `onlyOwner`) when exposing it externally.
     */
    function _setRoflAppId(bytes21 newRoflAppId) internal virtual {
        bytes21 previousRoflAppId = _roflAppId;
        _roflAppId = newRoflAppId;
        emit RoflAppIdUpdated(previousRoflAppId, newRoflAppId);
    }
}
