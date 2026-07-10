import { readFileSync } from "node:fs"
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
const callerTsconfigPath = join(
  medusaPackagePath,
  "..",
  "caller",
  "caller-tsconfig.json",
)

function resolveFrom(boundary: string, request: string): string {
  try {
    return createRequire(boundary).resolve(request)
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : "UNKNOWN"

    return `UNRESOLVED:${String(code)}`
  }
}

function expectPackagePath(
  resolution: string,
  scope: string,
  packageName: string,
): void {
  const components = resolution.split(/[\\/]+/)
  const scopeIndex = components.lastIndexOf(scope)

  expect(scopeIndex).toBeGreaterThanOrEqual(0)
  expect(components[scopeIndex + 1]).toBe(packageName)
}

describe("Fotomax Medusa CLI launcher", () => {
  it("declares workflow runtime imports as direct dependencies", () => {
    const manifest = JSON.parse(readFileSync(medusaPackagePath, "utf8")) as {
      dependencies?: Record<string, string>
    }

    expect(manifest.dependencies?.["@medusajs/core-flows"]).toBe("^2.17.2")
  })

  it("keeps Medusa UI path assertions separator portable", () => {
    const source = readFileSync(fileURLToPath(import.meta.url), "utf8")

    expect(source).not.toContain('stringContaining("@medusajs\\\\ui")')
  })

  it("resolves Medusa UI from the app and draft-order Admin boundaries", () => {
    const previousNodePath = process.env.NODE_PATH

    try {
      delete process.env.NODE_PATH
      require("node:module").Module._initPaths()

      expectPackagePath(
        resolveFrom(medusaPackagePath, "@medusajs/ui"),
        "@medusajs",
        "ui",
      )
      expectPackagePath(
        resolveFrom(draftOrderPackagePath, "@medusajs/ui"),
        "@medusajs",
        "ui",
      )
    } finally {
      if (previousNodePath === undefined) {
        delete process.env.NODE_PATH
      } else {
        process.env.NODE_PATH = previousNodePath
      }

      require("node:module").Module._initPaths()
    }
  })

  it("deterministically configures workspace tooling for the hoisted CLI", () => {
    const previousNodePath = process.env.NODE_PATH
    const previousProject = process.env.TS_NODE_PROJECT

    try {
      delete process.env.NODE_PATH
      process.env.TS_NODE_PROJECT = callerTsconfigPath

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
      expect(process.env.TS_NODE_PROJECT).toBe(runtime.tsNodeProject)
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
