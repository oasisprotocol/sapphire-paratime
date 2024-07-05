// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/**
 * @title Utility for converting date and time to timestamp
 * @notice Considers leap year, but not leap second.
 * @custom:attribution https://github.com/pipermerriam/ethereum-datetime/blob/master/contracts/DateTime.sol
 */
library DateTime {
    uint16 private constant ORIGIN_YEAR = 1970;

    function isLeapYear(uint16 year) internal pure returns (bool) {
        if (year % 4 != 0) {
            return false;
        }
        if (year % 100 != 0) {
            return true;
        }
        if (year % 400 != 0) {
            return false;
        }
        return true;
    }

    /**
     * @notice Convert year, month, day, hour, minute, second to Unix timestamp.
     * @dev Leap second is not supported.
     */
    function toTimestamp(
        uint16 year,
        uint8 month,
        uint8 day,
        uint8 hour,
        uint8 minute,
        uint8 second
    ) internal pure returns (uint256 timestamp) {
        uint16 i;

        // Year
        // TODO: Rewrite to O(1) time implementation.
        for (i = ORIGIN_YEAR; i < year; i++) {
            if (isLeapYear(i)) {
                timestamp += 366 days;
            } else {
                timestamp += 365 days;
            }
        }

        // Month
        // TODO: Use constants for monthDayCounts (hex-encoded string?), rewrite to O(1) time implementation.
        uint32[12] memory monthDayCounts;
        monthDayCounts[0] = 31;
        if (isLeapYear(year)) {
            monthDayCounts[1] = 29;
        } else {
            monthDayCounts[1] = 28;
        }
        monthDayCounts[2] = 31;
        monthDayCounts[3] = 30;
        monthDayCounts[4] = 31;
        monthDayCounts[5] = 30;
        monthDayCounts[6] = 31;
        monthDayCounts[7] = 31;
        monthDayCounts[8] = 30;
        monthDayCounts[9] = 31;
        monthDayCounts[10] = 30;
        monthDayCounts[11] = 31;

        for (i = 1; i < month; i++) {
            timestamp += monthDayCounts[i - 1] * 1 days;
        }

        // Day
        timestamp += uint32(day - 1) * 1 days;

        // Hour
        timestamp += uint32(hour) * 1 hours;

        // Minute
        timestamp += uint16(minute) * 1 minutes;

        // Second
        timestamp += second;

        return timestamp;
    }
}
