// SPDX-License-Identifier: Apache-2.0

import { expect } from 'chai';
import { ethers } from 'hardhat';

import { DateTimeTests__factory } from '../typechain-types/factories/contracts/tests';
import { DateTimeTests } from '../typechain-types/contracts/tests/DateTimeTests';

describe('DateTime', function () {
  async function deploy() {
    const DateTimeTests_factory = await ethers.getContractFactory("DateTimeTests");
    const dateTimeTests = await DateTimeTests_factory.deploy();
    await dateTimeTests.waitForDeployment();
    return { dateTimeTests };
  }

  it("isLeapYear", async function () {
    const {dateTimeTests} = await deploy();

    expect(await dateTimeTests.testIsLeapYear(2023)).eq(false);
    expect(await dateTimeTests.testIsLeapYear(2020)).eq(true);
    expect(await dateTimeTests.testIsLeapYear(2000)).eq(true);
    expect(await dateTimeTests.testIsLeapYear(1900)).eq(false);
  });

  it("toTimestamp", async function () {
    const {dateTimeTests} = await deploy();

    const date = "2024-07-10T10:24:49Z";
    expect(await dateTimeTests.testToTimestamp(2024, 7, 10, 10, 24, 49)).eq(Date.parse(date)/1000);
  });
});
