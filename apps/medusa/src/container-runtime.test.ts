import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

describe("Medusa container runtime", () => {
  it("binds the production server to every container interface on port 9000", () => {
    const packagePath = fileURLToPath(new URL("../package.json", import.meta.url))
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
      scripts: Record<string, string>
    }

    expect(packageJson.scripts["start:container"]).toBe(
      "medusa start --host 0.0.0.0 --port 9000",
    )
  })

  it("runs Medusa directly with the server-local binaries available", () => {
    const dockerfilePath = fileURLToPath(new URL("../../../Dockerfile", import.meta.url))
    const dockerfile = readFileSync(dockerfilePath, "utf8")

    expect(dockerfile).toContain('ENV PATH="/server/node_modules/.bin:${PATH}"')
    expect(dockerfile).toContain(
      'CMD ["medusa", "start", "--host", "0.0.0.0", "--port", "9000"]',
    )
  })

  it("excludes recursive build and test artifacts from the container context", () => {
    const dockerignorePath = fileURLToPath(
      new URL("../../../.dockerignore", import.meta.url),
    )
    const dockerignoreLines = readFileSync(dockerignorePath, "utf8").split(/\r?\n/)

    for (const pattern of [
      "**/.git",
      "**/.worktrees",
      "**/dist",
      "**/build",
      "**/.output",
      "**/.turbo",
      "**/coverage",
      "**/test-results",
      "**/playwright-report",
    ]) {
      expect(dockerignoreLines).toContain(pattern)
    }
  })
})
