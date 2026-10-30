module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/integration-tests/**/*.spec.cjs"],
  transform: {},
  globalSetup: "<rootDir>/integration-tests/global-setup.cjs",
  globalTeardown: "<rootDir>/integration-tests/global-teardown.cjs",
  testTimeout: 60000,
};
