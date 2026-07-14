import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

describe("Playwright runtime", () => {
  it("uses a portable Medusa command and serial workers", () => {
    const configPath = fileURLToPath(
      new URL("../playwright.config.ts", import.meta.url),
    )
    const config = readFileSync(configPath, "utf8")

    expect(config).toContain(
      'command: "npm run dev --workspace @fotomax/medusa"',
    )
    expect(config).not.toContain("npm.cmd")
    expect(config).toContain("next dev --webpack")
    expect(config).toMatch(/workers:\s*1/)
    expect(config).toMatch(/timeout:\s*120_000/)
    expect(config).toMatch(/expect:\s*\{\s*timeout:\s*30_000\s*\}/)
  })
})
