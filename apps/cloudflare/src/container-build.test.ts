import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

describe("Cloudflare container build scripts", () => {
  it("allows the Medusa production build to emit runtime JavaScript", () => {
    const tsconfigPath = fileURLToPath(
      new URL("../../medusa/tsconfig.json", import.meta.url),
    )
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as {
      compilerOptions: {
        module?: string
        moduleResolution?: string
        noEmit?: boolean
      }
      exclude?: string[]
    }

    expect(tsconfig.compilerOptions.noEmit).toBe(false)
    expect(tsconfig.compilerOptions.module).toBe("Node16")
    expect(tsconfig.compilerOptions.moduleResolution).toBe("Node16")
    expect(tsconfig.exclude).toEqual(
      expect.arrayContaining(["src/**/*.test.ts", "src/scripts/**/*.ts"]),
    )
  })
  it("builds the CI image locally without requiring Wrangler authentication", () => {
    const packagePath = fileURLToPath(new URL("../package.json", import.meta.url))
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
      scripts: Record<string, string>
    }

    expect(packageJson.scripts["container:build:ci"]).toBe(
      "docker build --tag fotomax-medusa:ci ../..",
    )
    expect(packageJson.scripts["container:build:ci"]).not.toContain("wrangler")
    expect(packageJson.scripts["container:build"]).toContain(
      "wrangler containers build",
    )
  })

  it("reuses installed workspace dependencies in the runtime image", () => {
    const dockerfilePath = fileURLToPath(
      new URL("../../../Dockerfile", import.meta.url),
    )
    const dockerfile = readFileSync(dockerfilePath, "utf8")

    expect(dockerfile).not.toContain("npm prune")
    expect(dockerfile).toContain(
      "COPY --from=build /server/node_modules ./node_modules",
    )
    expect(dockerfile).toContain(
      "COPY --from=build /server/apps/medusa/node_modules ./node_modules",
    )
  })

  it("exposes the CI image build from the repository root", () => {
    const packagePath = fileURLToPath(
      new URL("../../../package.json", import.meta.url),
    )
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
      scripts: Record<string, string>
    }

    expect(packageJson.scripts["cloudflare:container:build:ci"]).toBe(
      "npm run container:build:ci --workspace @fotomax/cloudflare",
    )
  })
})
