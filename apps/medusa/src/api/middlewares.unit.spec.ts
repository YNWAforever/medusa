import { describe, expect, it, vi } from "vitest"

const { authenticate, defineMiddlewares } = vi.hoisted(() => ({
  authenticate: vi.fn(() => "customer-bearer-auth"),
  defineMiddlewares: vi.fn((config: unknown) => config),
}))

vi.mock("@medusajs/framework/http", () => ({
  authenticate,
  defineMiddlewares,
}))

import middlewareConfig from "./middlewares"

describe("Medusa API middleware config", () => {
  it("allows optional customer bearer auth on store photo-job routes", () => {
    expect(authenticate).toHaveBeenCalledWith("customer", "bearer", {
      allowUnauthenticated: true,
    })
    expect(defineMiddlewares).toHaveBeenCalledWith({
      routes: [{
        matcher: "/store/photo-jobs*",
        middlewares: ["customer-bearer-auth"],
      }],
    })
    expect(middlewareConfig).toEqual(defineMiddlewares.mock.results[0].value)
  })
})
