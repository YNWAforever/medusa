import { readFileSync } from "node:fs"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { CheckoutFlow } from "./checkout-flow"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}))

const checkout = {
  cart: {
    id: "cart_123",
    currencyCode: "hkd" as const,
    items: [{ id: "line_1", kind: "retail" as const, variantId: "variant_1", title: "Film", thumbnail: null, quantity: 1, unitPrice: { amount: 7800, currencyCode: "hkd" as const }, subtotal: { amount: 7800, currencyCode: "hkd" as const }, photoJobVersionId: null, photoCount: null }],
    itemCount: 1,
    subtotal: { amount: 7800, currencyCode: "hkd" as const },
    shippingTotal: { amount: 0, currencyCode: "hkd" as const },
    taxTotal: { amount: 0, currencyCode: "hkd" as const },
    total: { amount: 7800, currencyCode: "hkd" as const },
    email: null,
  },
  shippingOptions: [
    { id: "so_delivery", kind: "delivery" as const, branchHandle: null, label: "Hong Kong Delivery", description: "Flat-rate delivery", price: { amount: 400, currencyCode: "hkd" as const }, compatible: true, reasonCode: null, stagingLabel: null },
    { id: "so_central", kind: "pickup" as const, branchHandle: "central-staging", label: "Central Staging Pickup", description: "Pickup", price: { amount: 0, currencyCode: "hkd" as const }, compatible: true, reasonCode: null, stagingLabel: "Staging test data" },
    { id: "so_mong-kok", kind: "pickup" as const, branchHandle: "mong-kok-staging", label: "Mong Kok Staging Pickup", description: "Pickup", price: { amount: 0, currencyCode: "hkd" as const }, compatible: false, reasonCode: "retail_out_of_stock", stagingLabel: "Staging test data" },
  ],
  paymentProviderId: "pp_system_default",
  fulfillment: null,
}

describe("localized checkout flow", () => {
  it("renders a compact contact step with an honest total", () => {
    const markup = renderToStaticMarkup(<CheckoutFlow locale="en" initialCheckout={checkout} />)
    expect(markup).toContain('data-checkout-flow="contact"')
    expect(markup).toContain("Contact details")
    expect(markup).toContain("HK$78.00")
    expect(markup).toContain("Continue to fulfillment")
  })

  it("renders the pickup choice and keeps an incompatible branch disabled with a reason", () => {
    const markup = renderToStaticMarkup(<CheckoutFlow locale="zh-HK" initialCheckout={{ ...checkout, stage: "fulfillment" }} />)
    expect(markup).toContain("選擇取貨方式")
    expect(markup).toContain("disabled")
    expect(markup).toContain("retail_out_of_stock")
  })

  it("keeps failures accessible and wires same-origin checkout mutations", () => {
    const source = readFileSync(new URL("./checkout-flow.tsx", import.meta.url), "utf8")
    expect(source).toContain('role="alert"')
    expect(source).toContain('aria-live="polite"')
    expect(source).toContain('credentials: "same-origin"')
    expect(source).toContain("/api/checkout/contact")
    expect(source).toContain("/api/checkout/fulfillment")
    expect(source).toContain("/api/checkout/payment")
    expect(source).toContain("/api/checkout/complete")
    expect(source).toContain("isSubmitting")
  })

  it("wires localized checkout and confirmation pages", () => {
    const checkoutPage = readFileSync(new URL("../../app/[locale]/checkout/page.tsx", import.meta.url), "utf8")
    const confirmationPage = readFileSync(new URL("../../app/[locale]/checkout/confirmation/page.tsx", import.meta.url), "utf8")
    expect(checkoutPage).toContain("<CheckoutFlow")
    expect(confirmationPage).toContain("OrderConfirmation")
  })
})
