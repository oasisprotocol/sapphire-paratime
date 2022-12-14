//SPDX-License-Identifier: UNLICENSED

// Solidity files have to start with this pragma.
// It will be used by the Solidity compiler to validate its version.
pragma solidity ^0.8.9;

// We import this library to be able to use console.log
import "hardhat/console.sol";
import "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";


// This is the main building block for smart contracts.
contract Favorite {
    // The maximum random number.
    uint256 public _maxNumber = 1000;

    /**
     * Contract initialization.
     */
    constructor() {
    }


    function maxNumber() external view returns (uint256) {
        return _maxNumber;
    }

    /**
     * Returns the current favorite number of the contract.
     */
    function favoriteNumber() external view returns (uint256) {
        uint256 entropy = uint256(bytes32(Sapphire.randomBytes(32, "favorite number")));
        uint256 rndNum = entropy % _maxNumber;
        return rndNum;
    }
}
