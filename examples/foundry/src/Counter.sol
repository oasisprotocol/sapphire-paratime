// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {SapphireDecryptor} from "dependencies/integrations-foundry/BinaryContracts.sol";

contract Counter is SapphireDecryptor {
    uint256 public number;
    
    function setNumber(uint256 newNumber) public {
        number = newNumber;
    }

    function increment() public {
        number++;
    }

    function withdraw() external {
        payable(msg.sender).transfer(address(this).balance);
    }
}
