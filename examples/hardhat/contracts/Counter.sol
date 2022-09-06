// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract Counter {
    event Incremented();

    uint256 private _count;

    function increment() external {
        _count += 1;
        emit Incremented();
    }

    function count() external view returns (uint256) {
        return _count;
    }
}
