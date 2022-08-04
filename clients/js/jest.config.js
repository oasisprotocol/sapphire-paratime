/** @type {import('@jest/types').Config.InitialOptions} */
const config = {
  coverageDirectory: 'coverage/jest',
  coveragePathIgnorePatterns: ['test/*'],
  coverageReporters: ['lcov', 'text', 'cobertura', 'html'],
  moduleFileExtensions: ['js', 'ts'],
  moduleNameMapper: {
    '^@oasislabs/sapphire-paratime$': '<rootDir>/src/index',
    '^@oasislabs/sapphire-paratime/(.*)\\.js$': '<rootDir>/src/$1',
    '^(\\..+)\\.js$': '$1',
  },
  testEnvironment: 'node',
  testRegex: 'test/.*\\.spec\\.ts$',
  transform: {
    '\\.ts$': 'ts-jest',
  },
};

export default config;
