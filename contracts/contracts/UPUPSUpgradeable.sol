// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title Universal Proposeable Upgradeable Proxy Standard (UPUPS)
 * @notice Extends `UUPSUpgradeable` with a two-step upgrade process that
 * prevents silent simulated upgrades that could extract confidential contract
 * state. The upgrader must first call `proposeUpgrade` to announce the new
 * implementation, and then call regular `upgradeToAndCall` in a later block.
 *
 * #### Example
 *
 * ```solidity
 * contract MyContract is UPUPSUpgradeable, OwnableUpgradeable {
 *   constructor() {
 *     _disableInitializers();
 *   }
 *
 *   function initialize(address _owner) public initializer {
 *     __Ownable_init(_owner);
 *     __UPUPSUpgradeable_init();
 *   }
 *
 *   // Gate _authorizeProposeUpgrade with appropriate modifier.
 *   function _authorizeProposeUpgrade(address, uint256) internal override onlyOwner {}
 *
 *   // Gate UUPSUpgradeable._authorizeUpgrade with appropriate modifier as you normally do.
 *   function _authorizeUpgrade(address) internal override onlyOwner {}
 * }
 * ```
 */
abstract contract UPUPSUpgradeable is UUPSUpgradeable {
    /// @custom:storage-location erc7201:oasisprotocol.storage.UPUPSUpgradeable
    struct UPUPSUpgradeableStorage {
        address _newImplementation;
        bytes32 _newImplementationHash;
        uint256 _minBlockNumber;
    }

    // keccak256(abi.encode(uint256(keccak256("oasisprotocol.storage.UPUPSUpgradeable")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant UPUPSUpgradeableStorageLocation =
        0x2ba9668233a4827367587178d890a758d4583dfd9e5c9ef8b58defb278a6ad00;

    function _getUPUPSUpgradeableStorage()
        private
        pure
        returns (UPUPSUpgradeableStorage storage $)
    {
        assembly {
            $.slot := UPUPSUpgradeableStorageLocation
        }
    }

    error ImplementationDoesNotMatch();
    error ImplementationHashDoesNotMatch();
    error MinBlockNumberInPast();
    error MinBlockNumberNotReached();
    error NewImplementationNotAContract();

    event UpgradeProposed(
        address indexed newImplementation,
        bytes32 indexed newImplementationHash,
        uint256 indexed minBlockNumber
    );

    event UpgradeAccepted(
        address indexed newImplementation,
        bytes32 indexed newImplementationHash,
        uint256 indexed minBlockNumber
    );

    function __UPUPSUpgradeable_init() internal onlyInitializing {}

    function __UPUPSUpgradeable_init_unchained() internal onlyInitializing {}

    /**
     * @notice This function should revert when `msg.sender` is not authorized
     * to propose the upgrade. Called by [proposeUpgrade](#proposeupgrade).
     *
     * Normally, this function will use an access control modifier such as
     * `Ownable.onlyOwner`.
     *
     * ```solidity
     * function _authorizeProposeUpgrade(address, uint256) internal onlyOwner {}
     * ```
     */
    function _authorizeProposeUpgrade(
        address newImplementation,
        uint256 minBlockNumber
    ) internal virtual;

    /**
     * @notice Returns the new implementation address of the proposed upgrade.
     */
    function proposedUpgradeImplementation() public view returns (address) {
        UPUPSUpgradeableStorage storage $ = _getUPUPSUpgradeableStorage();
        return $._newImplementation;
    }

    /**
     * @notice Returns the hash of the implementation runtime code of the proposed upgrade.
     */
    function proposedUpgradeImplementationHash() public view returns (bytes32) {
        UPUPSUpgradeableStorage storage $ = _getUPUPSUpgradeableStorage();
        return $._newImplementationHash;
    }

    /**
     * @notice Returns the proposed upgrade minimum block number.
     */
    function proposedUpgradeMinBlockNumber() public view returns (uint256) {
        UPUPSUpgradeableStorage storage $ = _getUPUPSUpgradeableStorage();
        return $._minBlockNumber;
    }

    /**
     * @notice Checks that the implementations match and the current block
     * number is at least minBlockNumber. Then consumes the proposed upgrade.
     */
    function _acceptProposedUpgrade(address newImplementation)
        internal
        virtual
    {
        if (newImplementation != proposedUpgradeImplementation()) {
            revert ImplementationDoesNotMatch();
        }
        if (newImplementation.codehash != proposedUpgradeImplementationHash()) {
            revert ImplementationHashDoesNotMatch();
        }
        if (block.number < proposedUpgradeMinBlockNumber()) {
            revert MinBlockNumberNotReached();
        }
        emit UpgradeAccepted(
            newImplementation,
            newImplementation.codehash,
            proposedUpgradeMinBlockNumber()
        );

        UPUPSUpgradeableStorage storage $ = _getUPUPSUpgradeableStorage();
        $._newImplementation = address(0);
        $._newImplementationHash = 0;
        $._minBlockNumber = 0;
    }

    /**
     * @notice Propose the upgrade to the new implementation address after the
     * given block number. If minBlockNumber is zero, take the number of the
     * next block.
     * @dev minBlockNumber is intentionally left to the caller's discretion:
     * the function guards against the simulated upgrade attack, but a longer
     * upgrade window may be enforced.
     */
    function proposeUpgrade(address newImplementation, uint256 minBlockNumber)
        public
        virtual
        onlyProxy
    {
        if (newImplementation.code.length == 0) {
            revert NewImplementationNotAContract();
        }
        if (minBlockNumber == 0) {
            minBlockNumber = block.number + 1;
        }
        if (minBlockNumber <= block.number) {
            revert MinBlockNumberInPast();
        }
        _authorizeProposeUpgrade(newImplementation, minBlockNumber);

        UPUPSUpgradeableStorage storage $ = _getUPUPSUpgradeableStorage();
        $._newImplementation = newImplementation;
        $._newImplementationHash = newImplementation.codehash;
        $._minBlockNumber = minBlockNumber;

        emit UpgradeProposed(
            newImplementation,
            newImplementation.codehash,
            minBlockNumber
        );
    }

    /**
     * @notice Upgrades the proxy to `newImplementation`, enforcing that it
     * matches a previously proposed and matured upgrade.
     * @dev The proposal check is applied here so that overriding
     * `UUPSUpgradeable._authorizeUpgrade` can never accidentally skip it.
     */
    function upgradeToAndCall(address newImplementation, bytes memory data)
        public
        payable
        virtual
        override
        onlyProxy
    {
        _acceptProposedUpgrade(newImplementation);
        super.upgradeToAndCall(newImplementation, data);
    }
}
