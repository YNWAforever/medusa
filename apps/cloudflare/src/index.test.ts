import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_URL: "postgres://staging-db",
    REDIS_URL: "rediss://staging-redis",
    STORE_CORS: "https://store.example.com",
    ADMIN_CORS: "https://admin.example.com",
    AUTH_CORS: "https://store.example.com",
    JWT_SECRET: "jwt-secret",
    COOKIE_SECRET: "cookie-secret",
  },
}))

vi.mock("@cloudflare/containers", () => ({
  Container: class {},
  getContainer: vi.fn(),
}))

import { FotomaxMedusaContainer } from "./index"

describe("FotomaxMedusaContainer", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("rethrows container startup errors after logging them", () => {
    const error = new Error("startup failed")
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    expect(() =>
      FotomaxMedusaContainer.prototype.onError.call({}, error),
    ).toThrow(error)
    expect(errorSpy).toHaveBeenCalledWith("medusa_container_error", error)
  })
})
