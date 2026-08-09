import { describe, expect, it, vi } from "vitest"

const { authenticate, defineMiddlewares } = vi.hoisted(() => ({
  authenticate: vi.fn(() => "customer-bearer-auth"),
  defineMiddlewares: vi.fn((config: unknown) => config),
}))

vi.mock("@medusajs/framework/http", () => ({
  authenticate,
  defineMiddlewares,
}))

import middlewareConfig, { enforcePhotoOrigin } from "./middlewares"

describe("Medusa API middleware config", () => {
  it("allows optional customer bearer auth on store photo-job routes", () => {
    expect(authenticate).toHaveBeenCalledWith("customer", "bearer", {
      allowUnauthenticated: true,
    })
    expect(defineMiddlewares).toHaveBeenCalledWith({
      routes: [{
        matcher: "/store/photo-jobs*",
        middlewares: [enforcePhotoOrigin, "customer-bearer-auth"],
      }],
    })
    expect(middlewareConfig).toEqual(defineMiddlewares.mock.results[0].value)
  })
  it("rejects hostile origins for mutations and permits trusted or server requests", () => {
    process.env.STORE_CORS = "https://staging.fotomax.example"
    const next = vi.fn()

    expect(() => enforcePhotoOrigin({ method: "POST", headers: { origin: "https://evil.example" } } as never, {} as never, next)).toThrow("photo_origin_forbidden")
    enforcePhotoOrigin({ method: "POST", headers: { origin: "https://staging.fotomax.example" } } as never, {} as never, next)
    enforcePhotoOrigin({ method: "POST", headers: {} } as never, {} as never, next)
    enforcePhotoOrigin({ method: "GET", headers: { origin: "https://evil.example" } } as never, {} as never, next)

    expect(next).toHaveBeenCalledTimes(3)
  })
})
