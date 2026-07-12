import { describe, expect, it } from "vitest"
import type { CatalogProduct } from "./medusa/contracts"
import { addCartItem, getCartSubtotal, type CartItem } from "./cart-state"

const firstProduct: CatalogProduct = { id: "prod_print", handle: "classic-4r-photo-print", title: "Classic 4R Photo Print", description: "Prints", thumbnail: null, collectionHandle: "photo-print", badge: "Popular", commerceMode: "retail", variants: [{ id: "variant_print", title: "Default", sku: "PRINT", options: [], price: { amount: 280, currencyCode: "hkd" }, inventory: { managed: true, available: true, quantity: 10 } }] }
const secondProduct: CatalogProduct = { ...firstProduct, id: "prod_film", handle: "instax-mini-film", title: "Instax Mini Film", variants: [{ ...firstProduct.variants[0], id: "variant_film", price: { amount: 7800, currencyCode: "hkd" } }] }

describe("cart state", () => {
  it("adds a new DTO product as a single cart line", () => { expect(addCartItem([], firstProduct)).toEqual([{ product: firstProduct, quantity: 1 }]) })
  it("increments an existing line without mutating the input", () => { const existingLine: CartItem = { product: firstProduct, quantity: 1 }; const items: CartItem[] = [existingLine]; const nextItems = addCartItem(items, firstProduct); expect(nextItems).not.toBe(items); expect(nextItems[0]).not.toBe(existingLine); expect(nextItems).toEqual([{ product: firstProduct, quantity: 2 }]); expect(items).toEqual([{ product: firstProduct, quantity: 1 }]) })
  it("calculates a quantity-aware subtotal from variant prices in cents", () => { const items: CartItem[] = [{ product: firstProduct, quantity: 2 }, { product: secondProduct, quantity: 3 }]; expect(getCartSubtotal(items)).toBe(280 * 2 + 7800 * 3) })
  it("treats a variantless cart line as zero instead of producing NaN", () => {
    const variantlessProduct: CatalogProduct = { ...firstProduct, variants: [] }

    expect(getCartSubtotal([{ product: variantlessProduct, quantity: 2 }])).toBe(0)
  })

})