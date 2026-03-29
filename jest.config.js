/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^\\.\\./\\.\\./\\.\\./node_modules/@openai/codex-sdk/dist/index\\.js$': '<rootDir>/test/mocks/codex-sdk.js',
  },
};
