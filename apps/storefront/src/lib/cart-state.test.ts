import { describe, expect, it } from "vitest"
import type { CartLineView, CartView } from "./medusa/contracts"
import { cartItemCount, getCartSubtotal, groupCartLines } from "./cart-state"

const retail: CartLineView = { id: "line_retail", kind: "retail", variantId: "variant_retail", title: "Film", thumbnail: null, quantity: 2, unitPrice: { amount: 7800, currencyCode: "hkd" }, subtotal: { amount: 15600, currencyCode: "hkd" }, photoJobVersionId: null, photoCount: null }
const print: CartLineView = { ...retail, id: "line_print", kind: "photo_print", variantId: "variant_print", quantity: 1, subtotal: { amount: 7800, currencyCode: "hkd" } }

describe("cart state", () => {
  it("calculates subtotal from CartLineView values", () => expect(getCartSubtotal([retail, print])).toBe(23400))
  it("groups DTO lines without importing catalog products", () => expect(groupCartLines([retail, print])).toEqual({ retail: [retail], photo_print: [print] }))
  it("counts quantities from the canonical CartView", () => {
    const cart: CartView = { id: "cart_123", currencyCode: "hkd", items: [retail, print], itemCount: 3, subtotal: { amount: 23400, currencyCode: "hkd" }, shippingTotal: { amount: 0, currencyCode: "hkd" }, taxTotal: { amount: 0, currencyCode: "hkd" }, total: { amount: 23400, currencyCode: "hkd" }, email: null }
    expect(cartItemCount(cart)).toBe(3)
  })
})
