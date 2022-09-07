// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./@oasisprotocol-sapphire-contracts/token/ERC20C/ERC20C.sol";
import "./@oasisprotocol-sapphire-contracts/token/ERC20C/extensions/ERC20CBurnable.sol";

contract WrappedSROSE is ERC20C, ERC20CBurnable {
    constructor() ERC20C("WrappedSROSE", "wsROSE") {
        return;
    }

    /// @notice Wraps sROSE to wsROSE without privacy.
    /// @notice If you need anonymity, try using a tumbler and structured deposits.
    /// @dev This is why `totalSupply` is not private.
    receive() external payable {
        _mint(_msgSender(), msg.value);
    }

    /// @notice Unwraps wsROSE to sROSE without privacy.
    /// @notice If you need anonymity, try using structured withdrawals.
    function withdraw(uint256 amount) external {
        _burn(_msgSender(), amount);
        payable(msg.sender).transfer(amount);
    }

    function balanceOf(address account) public view override returns (uint256) {
        require(account == _msgSender(), "wsROSE: permission denied");
        return super.balanceOf(account);
    }
}
