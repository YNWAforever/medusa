import { describe, expect, it } from "vitest"
import { products } from "@fotomax/shared"
import { addCartItem, getCartSubtotal, type CartItem } from "./cart-state"

const firstProduct = products.at(0)!
const secondProduct = products.at(1)!

describe("cart state", () => {
  it("adds a new product as a single cart line", () => {
    const items = addCartItem([], firstProduct)

    expect(items).toEqual([{ product: firstProduct, quantity: 1 }])
  })

  it("increments an existing line without mutating the input", () => {
    const existingLine: CartItem = { product: firstProduct, quantity: 1 }
    const items: CartItem[] = [existingLine]

    const nextItems = addCartItem(items, firstProduct)

    expect(nextItems).not.toBe(items)
    expect(nextItems[0]).not.toBe(existingLine)
    expect(nextItems).toEqual([{ product: firstProduct, quantity: 2 }])
    expect(items).toEqual([{ product: firstProduct, quantity: 1 }])
  })

  it("calculates a quantity-aware subtotal in cents", () => {
    const items: CartItem[] = [
      { product: firstProduct, quantity: 2 },
      { product: secondProduct, quantity: 3 },
    ]

    expect(getCartSubtotal(items)).toBe(firstProduct.priceCents * 2 + secondProduct.priceCents * 3)
  })
})
