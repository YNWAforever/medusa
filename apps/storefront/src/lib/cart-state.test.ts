import { describe, expect, it } from "vitest"
import type { CartLineView, CartView } from "./medusa/contracts"
import { cartItemCount, createCartRefreshGuard, getCartSubtotal, groupCartLines } from "./cart-state"

const retail: CartLineView = { id: "line_retail", kind: "retail", variantId: "variant_retail", title: "Film", thumbnail: null, quantity: 2, unitPrice: { amount: 7800, currencyCode: "hkd" }, subtotal: { amount: 15600, currencyCode: "hkd" }, photoJobVersionId: null, photoCount: null }
const print: CartLineView = { ...retail, id: "line_print", kind: "photo_print", variantId: "variant_print", quantity: 1, subtotal: { amount: 7800, currencyCode: "hkd" } }

describe("cart state", () => {
  it("calculates subtotal from CartLineView values", () => expect(getCartSubtotal([retail, print])).toBe(23400))
  it("groups DTO lines without importing catalog products", () => expect(groupCartLines([retail, print])).toEqual({ retail: [retail], photo_print: [print] }))
  it("counts quantities from the canonical CartView", () => {
    const cart: CartView = { id: "cart_123", currencyCode: "hkd", items: [retail, print], itemCount: 3, subtotal: { amount: 23400, currencyCode: "hkd" }, shippingTotal: { amount: 0, currencyCode: "hkd" }, taxTotal: { amount: 0, currencyCode: "hkd" }, total: { amount: 23400, currencyCode: "hkd" }, email: null }
    expect(cartItemCount(cart)).toBe(3)
  })

  it("discards a refresh snapshot that resolves after a cart mutation", async () => {
    const guard = createCartRefreshGuard()
    let resolveRefresh: (cart: CartView) => void = () => undefined
    const refresh = new Promise<CartView>((resolve) => {
      resolveRefresh = resolve
    })
    const refreshVersion = guard.capture()
    const applied = refresh.then((cart) => guard.isCurrent(refreshVersion) ? cart : null)

    guard.invalidate()
    resolveRefresh({ id: null, currencyCode: "hkd", items: [], itemCount: 0, subtotal: { amount: 0, currencyCode: "hkd" }, shippingTotal: { amount: 0, currencyCode: "hkd" }, taxTotal: { amount: 0, currencyCode: "hkd" }, total: { amount: 0, currencyCode: "hkd" }, email: null })

    await expect(applied).resolves.toBeNull()
  })
})
