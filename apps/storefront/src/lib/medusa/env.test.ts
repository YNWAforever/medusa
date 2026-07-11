import { describe, expect, it } from "vitest"
import { getStorefrontEnv } from "./env"

const productionEnv = {
  NODE_ENV: "production",
  MEDUSA_BACKEND_URL: "http://localhost:9000",
  MEDUSA_PUBLISHABLE_KEY: "pk_test_123",
  STOREFRONT_SESSION_SECRET: "session-secret",
}

describe("storefront Medusa environment", () => {
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
