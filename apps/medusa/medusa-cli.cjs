const { Module } = require("node:module")
const { delimiter, join } = require("node:path")

function configureCliRuntime() {
  const workspaceNodeModules = join(__dirname, "node_modules")
  const configuredPaths = (process.env.NODE_PATH || "")
    .split(delimiter)
    .filter(Boolean)

  if (!configuredPaths.includes(workspaceNodeModules)) {
    configuredPaths.unshift(workspaceNodeModules)
  }

  process.env.NODE_PATH = configuredPaths.join(delimiter)
  process.env.TS_NODE_PROJECT ||= join(__dirname, "tsconfig.json")
  Module._initPaths()

  return {
    workspaceNodeModules,
    tsNodeProject: process.env.TS_NODE_PROJECT,
  }
}

if (require.main === module) {
  configureCliRuntime()
  require("@medusajs/cli/cli")
}

module.exports = { configureCliRuntime }
