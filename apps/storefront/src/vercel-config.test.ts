import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

describe("Vercel deployment configuration", () => {
  it("declares the storefront as a Next.js project", () => {
    const configPath = fileURLToPath(new URL("../vercel.json", import.meta.url))
    const config = JSON.parse(readFileSync(configPath, "utf8")) as { framework?: string }

    expect(config.framework).toBe("nextjs")
  })
})
