// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract WrappedROSE is ERC20, ERC20Burnable {
    event Deposit(address indexed dst, uint256 wad);
    event Withdrawal(address indexed src, uint256 wad);

    //solhint-disable-next-line no-empty-blocks
    constructor() ERC20("Wrapped ROSE", "wROSE") {}

    function deposit() external payable {
        _deposit();
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        payable(msg.sender).transfer(amount);
        emit Withdrawal(msg.sender, amount);
    }

    receive() external payable {
        _deposit();
    }

    function _deposit() internal {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }
}
