import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  createStoreSdk,
  createCheckoutSdk,
  createCheckoutAdapter,
  getBranchAvailability,
  createBranchStoreClient,
  parseContactInput,
  parseFulfillmentInput,
  sealOrderConfirmation,
} = vi.hoisted(() => ({
  createStoreSdk: vi.fn(),
  createCheckoutSdk: vi.fn(),
  createCheckoutAdapter: vi.fn(),
  getBranchAvailability: vi.fn(),
  createBranchStoreClient: vi.fn(),
  parseContactInput: vi.fn((value: unknown) => value),
  parseFulfillmentInput: vi.fn((value: unknown) => value),
  sealOrderConfirmation: vi.fn(() => "sealed-confirmation"),
}))

vi.mock("./lib/medusa/client", () => ({ createStoreSdk }))
vi.mock("./lib/medusa/checkout", () => ({
  CheckoutError: class CheckoutError extends Error {
    constructor(readonly code: string) { super(code) }
  },
  createCheckoutSdk,
  createCheckoutAdapter,
  parseContactInput,
  parseFulfillmentInput,
}))
vi.mock("./lib/medusa/branches", () => ({ getBranchAvailability, createBranchStoreClient }))
vi.mock("./lib/confirmation-cookie", () => ({ sealOrderConfirmation, ORDER_CONFIRMATION_COOKIE: "fm_order_confirmation", orderConfirmationCookieOptions: { httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: 900 } }))

import { GET as checkout } from "../app/api/checkout/route"
import { POST as contact } from "../app/api/checkout/contact/route"
import { POST as fulfillment } from "../app/api/checkout/fulfillment/route"
import { POST as payment } from "../app/api/checkout/payment/route"
import { POST as complete } from "../app/api/checkout/complete/route"

function request(path: string, init: { method?: string; body?: string } = {}, cookies: Record<string, string> = {}) {
  const cookie = Object.entries(cookies).map(([key, value]) => key + "=" + value).join("; ")
  return new NextRequest("http://localhost" + path, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
  })
}

const snapshot = {
  cart: { id: "cart_123", items: [{ id: "line_1" }], total: { amount: 7800, currencyCode: "hkd" } },
  shippingOptions: [],
  paymentProviderId: "pp_system_default",
  fulfillment: null,
}

const adapter = {
  getCheckout: vi.fn(),
  updateContact: vi.fn(),
  setFulfillment: vi.fn(),
  validate: vi.fn(),
  initializePayment: vi.fn(),
  complete: vi.fn(),
}

beforeEach(() => {
  for (const mock of [createStoreSdk, createCheckoutSdk, createCheckoutAdapter, getBranchAvailability, createBranchStoreClient, parseContactInput, parseFulfillmentInput, sealOrderConfirmation, ...Object.values(adapter)]) mock.mockReset()
  createStoreSdk.mockResolvedValue({})
  createCheckoutSdk.mockReturnValue({})
  createCheckoutAdapter.mockReturnValue(adapter)
  createBranchStoreClient.mockReturnValue({})
  getBranchAvailability.mockResolvedValue([])
  parseContactInput.mockImplementation((value: unknown) => value)
  parseFulfillmentInput.mockImplementation((value: unknown) => value)
  sealOrderConfirmation.mockReturnValue("sealed-confirmation")
  adapter.getCheckout.mockResolvedValue(snapshot)
  adapter.updateContact.mockResolvedValue(snapshot.cart)
  adapter.setFulfillment.mockResolvedValue({ cart: snapshot.cart, fulfillment: { kind: "pickup", shippingOptionId: "so_central", branchHandle: "central-staging" } })
  adapter.validate.mockResolvedValue({ cart: snapshot.cart, fulfillment: { kind: "pickup", shippingOptionId: "so_central", branchHandle: "central-staging" } })
  adapter.initializePayment.mockResolvedValue({ id: "pay_col", providerId: "pp_system_default", status: "pending" })
  adapter.complete.mockResolvedValue({ orderId: "order_123", displayId: 42, email: "customer@example.com", total: snapshot.cart.total, fulfillmentKind: "pickup", createdAt: "2026-07-13T00:00:00.000Z" })
})

describe("checkout BFF", () => {
  it("returns a localized recovery href instead of creating a cart for an empty checkout", async () => {
    const response = await checkout(request("/api/checkout?locale=zh-HK"))
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: { code: "empty_cart", recoveryHref: "/zh-HK/" } })
    expect(createStoreSdk).not.toHaveBeenCalled()
  })

  it("loads a fresh checkout snapshot from the cart cookie", async () => {
    const response = await checkout(request("/api/checkout?locale=en", {}, { fm_cart_id: "cart_123" }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ checkout: snapshot })
    expect(adapter.getCheckout).toHaveBeenCalledWith("cart_123", "en", [])
  })

  it("maps invalid contact input without touching Medusa", async () => {
    parseContactInput.mockImplementationOnce(() => { throw new Error("invalid_checkout_input") })
    const response = await contact(request("/api/checkout/contact", { method: "POST", body: JSON.stringify({}) }, { fm_cart_id: "cart_123" }))
    expect(response.status).toBe(400)
    expect(adapter.updateContact).not.toHaveBeenCalled()
  })

  it("preserves the cart when a pickup branch becomes incompatible", async () => {
    adapter.setFulfillment.mockRejectedValueOnce({ code: "incompatible_branch" })
    const response = await fulfillment(request("/api/checkout/fulfillment?locale=en", { method: "POST", body: JSON.stringify({ kind: "pickup", shippingOptionId: "so_mong-kok", branchHandle: "mong-kok-staging" }) }, { fm_cart_id: "cart_123" }))
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({ error: { code: "incompatible_branch" } })
  })

  it("initializes the allowlisted system payment provider", async () => {
    const response = await payment(request("/api/checkout/payment", { method: "POST" }, { fm_cart_id: "cart_123" }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ payment: { id: "pay_col", providerId: "pp_system_default", status: "pending" } })
    expect(adapter.initializePayment).toHaveBeenCalledWith("cart_123")
  })

  it("sets a private confirmation and clears the cart only after successful completion", async () => {
    const response = await complete(request("/api/checkout/complete?locale=en", { method: "POST" }, { fm_cart_id: "cart_123" }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ confirmation: expect.objectContaining({ orderId: "order_123" }) })
    expect(response.cookies.get("fm_cart_id")?.value).toBe("")
    expect(response.cookies.get("fm_order_confirmation")?.value).toBe("sealed-confirmation")
  })

  it("does not repeat completion after the cart cookie is gone", async () => {
    const response = await complete(request("/api/checkout/complete?locale=en", { method: "POST" }))
    expect(response.status).toBe(409)
    expect(adapter.complete).not.toHaveBeenCalled()
  })
})
