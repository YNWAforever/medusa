import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

describe("Cloudflare container build scripts", () => {
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
