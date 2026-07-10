import { createRequire } from "node:module"
import { delimiter, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const require = createRequire(import.meta.url)
const launcherPath = fileURLToPath(
  new URL("../../medusa-cli.cjs", import.meta.url),
)
const medusaPackagePath = fileURLToPath(
  new URL("../../package.json", import.meta.url),
)
const draftOrderPackagePath = join(
  medusaPackagePath,
  "..",
  "node_modules",
  "@medusajs",
  "draft-order",
  "package.json",
)

function resolveFrom(boundary: string, request: string): string {
  try {
    return createRequire(boundary).resolve(request)
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : "UNKNOWN"

    return `UNRESOLVED:${String(code)}`
  }
}

describe("Fotomax Medusa CLI launcher", () => {
  it("resolves Medusa UI from the app and draft-order Admin boundaries", () => {
    const previousNodePath = process.env.NODE_PATH

    try {
      delete process.env.NODE_PATH
      require("node:module").Module._initPaths()

      expect({
        app: resolveFrom(medusaPackagePath, "@medusajs/ui"),
        draftOrderAdmin: resolveFrom(draftOrderPackagePath, "@medusajs/ui"),
      }).toEqual({
        app: expect.stringContaining("@medusajs\\ui"),
        draftOrderAdmin: expect.stringContaining("@medusajs\\ui"),
      })
    } finally {
      if (previousNodePath === undefined) {
        delete process.env.NODE_PATH
      } else {
        process.env.NODE_PATH = previousNodePath
      }

      require("node:module").Module._initPaths()
    }
  })

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
