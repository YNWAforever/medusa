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
})
