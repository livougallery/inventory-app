module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  // Jangan sapu worktree (mis. .worktrees/pembelian-material) — suite-nya
  // duplikat dan berbagi skema Postgres "test" yang sama.
  testPathIgnorePatterns: ['/node_modules/', '/\\.worktrees/'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  // All suites share the Postgres "test" schema (tests/setup.js). Running
  // suites in parallel would DROP/CREATE the schema under each other.
  maxWorkers: 1,
};