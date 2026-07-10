import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import playwrightConfig from "../playwright.config"

describe("Playwright server ownership", () => {
  it("starts and owns a fresh storefront server by default", () => {
    const webServer = Array.isArray(playwrightConfig.webServer)
      ? playwrightConfig.webServer[0]
      : playwrightConfig.webServer

    expect(webServer?.reuseExistingServer).toBe(false)
    expect(webServer?.command).toContain("next dev")
  })

  it("keeps both production applications in the canonical root build gate", () => {
    const rootPackage = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { scripts: Record<string, string> }

    expect(rootPackage.scripts.build).toBe(
      "npm run build --workspace @fotomax/storefront && npm run build --workspace @fotomax/medusa",
    )
    expect(rootPackage.scripts.check).toBe(
      "npm run typecheck && npm run test && npm run build",
    )
  })
})
