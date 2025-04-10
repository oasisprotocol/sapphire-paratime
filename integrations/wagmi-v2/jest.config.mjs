/** @type {import('@jest/types').Config.InitialOptions} */
const config = {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  coverageDirectory: 'coverage/jest',
  coveragePathIgnorePatterns: ['test/*'],
  coverageReporters: ['lcov', 'text', 'cobertura', 'html'],
  moduleFileExtensions: ['js', 'ts'],
  moduleNameMapper: {
    '^@oasisprotocol/sapphire-wagmi-v2$': '<rootDir>/src/index',
    '^@oasisprotocol/sapphire-wagmi-v2/(.*)\\.js$': '<rootDir>/src/$1',
    '^(\\..+)\\.js$': '$1',
  },
  testEnvironment: 'jest-environment-jsdom',
  testRegex: 'test/.*\\.spec\\.ts$',
  transform: {
    '\\.ts$': ["ts-jest", {
      "useESM": true,
      "tsconfig": "tsconfig.test.json"
    }]
  },
  setupFiles: ['<rootDir>/jest.setup.mjs']
};

export default config;
