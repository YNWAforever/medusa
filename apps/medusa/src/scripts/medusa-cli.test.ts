import { createRequire } from "node:module"
import { delimiter, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const require = createRequire(import.meta.url)
const launcherPath = fileURLToPath(
  new URL("../../medusa-cli.cjs", import.meta.url),
)

describe("Fotomax Medusa CLI launcher", () => {
  it("makes workspace TypeScript tooling visible to the hoisted CLI", () => {
    const previousNodePath = process.env.NODE_PATH
    const previousProject = process.env.TS_NODE_PROJECT

    try {
      delete process.env.NODE_PATH
      delete process.env.TS_NODE_PROJECT

      const { configureCliRuntime } = require(launcherPath) as {
        configureCliRuntime: () => {
          workspaceNodeModules: string
          tsNodeProject: string
        }
      }
      const runtime = configureCliRuntime()
      const cliEntry = require.resolve("@medusajs/cli/cli")
      const cliRequire = createRequire(cliEntry)
      const configuredNodePath = Reflect.get(process.env, "NODE_PATH") as
        | string
        | undefined

      expect(configuredNodePath?.split(delimiter)).toContain(
        runtime.workspaceNodeModules,
      )
      expect(runtime.tsNodeProject).toBe(
        join(runtime.workspaceNodeModules, "..", "tsconfig.json"),
      )
      expect(cliRequire.resolve("ts-node")).toContain(
        join("apps", "medusa", "node_modules", "ts-node"),
      )
    } finally {
      if (previousNodePath === undefined) {
        delete process.env.NODE_PATH
      } else {
        process.env.NODE_PATH = previousNodePath
      }

      if (previousProject === undefined) {
        delete process.env.TS_NODE_PROJECT
      } else {
        process.env.TS_NODE_PROJECT = previousProject
      }

      require("node:module").Module._initPaths()
    }
  })
})
