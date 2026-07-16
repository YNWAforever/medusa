import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
import { orderConfirmationCookieOptions, sealOrderConfirmation, unsealOrderConfirmation } from "./confirmation-cookie"

const confirmation = {
  orderId: "order_123",
  displayId: 42,
  email: "customer@example.com",
  total: { amount: 11800, currencyCode: "hkd" as const },
  fulfillmentKind: "pickup" as const,
  createdAt: "2026-07-13T00:00:00.000Z",
}

describe("private order confirmation cookie", () => {
  it("round-trips encrypted authenticated confirmation data", () => {
    const sealed = sealOrderConfirmation(confirmation, "test-session-secret")
    expect(sealed).not.toContain("customer@example.com")
    expect(unsealOrderConfirmation(sealed, "test-session-secret")).toEqual(confirmation)
  })

  it("rejects forged or malformed values without throwing", () => {
    const sealed = sealOrderConfirmation(confirmation, "test-session-secret")
    expect(unsealOrderConfirmation(sealed.slice(0, -2) + "xx", "test-session-secret")).toBeNull()
    expect(unsealOrderConfirmation("not-a-cookie", "test-session-secret")).toBeNull()
  })

  it("uses a short HttpOnly same-origin cookie lifetime", () => {
    expect(orderConfirmationCookieOptions).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 900 })
  })
})
