import { resetHardhatContext } from 'hardhat/plugins-testing';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import path from 'path';
import '@nomiclabs/hardhat-ethers/internal/type-extensions';
import '@nomicfoundation/hardhat-chai-matchers/types';

declare module 'mocha' {
  interface Context {
    hre: HardhatRuntimeEnvironment;
  }
}

export function useEnvironment(fixtureProjectName: string) {
  before(
    'Loading hardhat environment and compiling the contract',
    async function () {
      process.chdir(
        path.join(__dirname, 'fixture-projects', fixtureProjectName),
      );

      this.hre = require('@oasislabs/hardhat');
      await this.hre.run('compile', { quiet: true });
    },
  );

  afterEach('Resetting hardhat', function () {
    resetHardhatContext();
  });
}
