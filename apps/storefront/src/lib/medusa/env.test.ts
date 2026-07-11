import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { getStorefrontEnv } from "./env"

const productionEnv = {
  NODE_ENV: "production",
  MEDUSA_BACKEND_URL: "http://localhost:9000",
  MEDUSA_PUBLISHABLE_KEY: "pk_test_123",
  STOREFRONT_SESSION_SECRET: "session-secret",
}

describe("storefront Medusa environment", () => {
  it("marks the session-secret reader as server-only", async () => {
    const source = await readFile(fileURLToPath(new URL("./env.ts", import.meta.url)), "utf8")

    expect(source).toMatch(/^import "server-only"/)
  })

  it.each([
    "MEDUSA_BACKEND_URL",
    "MEDUSA_PUBLISHABLE_KEY",
    "STOREFRONT_SESSION_SECRET",
  ] as const)("requires %s for production", (missingKey) => {
    const environment: Record<string, string | undefined> = { ...productionEnv }
    delete environment[missingKey]

    expect(() => getStorefrontEnv(environment)).toThrow(`Missing required environment variable: ${missingKey}`)
  })

  it("returns the server runtime configuration", () => {
    expect(getStorefrontEnv(productionEnv)).toEqual({
      backendUrl: "http://localhost:9000",
      publishableKey: "pk_test_123",
      sessionSecret: "session-secret",
    })
  })
})
