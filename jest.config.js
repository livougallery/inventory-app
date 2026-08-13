module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  // All suites share the Postgres "test" schema (tests/setup.js). Running
  // suites in parallel would DROP/CREATE the schema under each other.
  maxWorkers: 1,
};