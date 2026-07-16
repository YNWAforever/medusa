import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

describe("Medusa integration test runtime", () => {
  it("forces Jest to exit after the Medusa harness completes", () => {
    const packagePath = fileURLToPath(new URL("../package.json", import.meta.url))
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
      scripts: Record<string, string>
    }

    expect(packageJson.scripts["test:integration"]).toContain("--forceExit")
  })
})
