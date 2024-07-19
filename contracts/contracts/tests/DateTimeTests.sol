// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {DateTime} from "../DateTime.sol";

contract DateTimeTests {
    function testIsLeapYear(uint16 year) external pure returns (bool) {
        return DateTime.isLeapYear(year);
    }

    function testToTimestamp(
        uint16 year,
        uint8 month,
        uint8 day,
        uint8 hour,
        uint8 minute,
        uint8 second
    ) external pure returns (uint256 timestamp) {
        return DateTime.toTimestamp(year, month, day, hour, minute, second);
    }
}
