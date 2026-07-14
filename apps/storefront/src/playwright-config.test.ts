import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import playwrightConfig from "../playwright.config"

describe("Playwright server ownership", () => {
  it("starts and owns fresh Medusa and storefront servers by default", () => {
    const servers = Array.isArray(playwrightConfig.webServer)
      ? playwrightConfig.webServer
      : playwrightConfig.webServer ? [playwrightConfig.webServer] : []
    const medusa = servers.find((server) => server.name === "Medusa")
    const storefront = servers.find((server) => server.name === "Storefront")

    expect(servers).toHaveLength(2)
    expect(medusa?.reuseExistingServer).toBe(false)
    expect(medusa?.command).toContain("dev --workspace @fotomax/medusa")
    expect(storefront?.reuseExistingServer).toBe(false)
    expect(storefront?.command).toContain("next dev")
  })

  it("keeps every production application in the canonical root build gate", () => {
    const rootPackage = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { scripts: Record<string, string> }

    expect(rootPackage.scripts.build).toBe(
      "npm run build --workspace @fotomax/storefront && npm run build --workspace @fotomax/medusa && npm run build --workspace @fotomax/cloudflare",
    )
    expect(rootPackage.scripts.check).toBe(
      "npm run typecheck && npm run test && npm run build",
    )
  })
})