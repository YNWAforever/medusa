module.exports = {
  roots: ["<rootDir>/integration-tests"],
  testEnvironment: "node",
  testMatch: ["**/*.spec.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }],
  },
  testTimeout: 240000,
  maxWorkers: 1,
}
