module.exports = {
  roots: ["<rootDir>/integration-tests"],
  testEnvironment: "node",
  testMatch: ["**/*.spec.ts"],
  modulePaths: ["<rootDir>/node_modules"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }],
  },
  testTimeout: 240000,
  maxWorkers: 1,
}
