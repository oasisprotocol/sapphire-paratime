/** @type {import('@jest/types').Config.InitialOptions} */
const config = {
  coverageDirectory: 'coverage/jest',
  coveragePathIgnorePatterns: ['test/*'],
  coverageReporters: ['lcov', 'text', 'cobertura'],
  moduleFileExtensions: ['js', 'ts'],
  moduleNameMapper: {
    '^@oasislabs/sapphire-paratime$': '<rootDir>/src/index',
    '^@oasislabs/sapphire-paratime/(.*)$': '<rootDir>/src/$1',
  },
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '\\.ts$': 'ts-jest',
    '\\.js$': 'babel-jest',
  },
};

export default config;
