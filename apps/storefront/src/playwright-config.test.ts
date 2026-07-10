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
})
