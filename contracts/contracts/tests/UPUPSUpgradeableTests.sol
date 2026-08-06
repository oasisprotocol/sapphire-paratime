// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

// Pulls ERC1967Proxy into the compilation output so tests can deploy it
// via `ethers.getContractFactory('ERC1967Proxy')`.
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {UPUPSUpgradeable} from "../UPUPSUpgradeable.sol";

contract UPUPSUpgradeableTests is UPUPSUpgradeable, OwnableUpgradeable {
    function initialize(address initialOwner) external initializer {
        __Ownable_init(initialOwner);
        __UPUPSUpgradeable_init();
    }

    function version() external pure virtual returns (uint256) {
        return 1;
    }

    function _authorizeProposeUpgrade(address, uint256) internal override onlyOwner {}

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
