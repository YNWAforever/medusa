import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"
import type Medusa from "@medusajs/js-sdk"

vi.mock("server-only", () => ({}))

import {
  CartError,
  createCartAdapter,
  emptyCartView,
  parseAddCartItemInput,
  parseQuantityInput,
  parseUpdateCartItemInput,
  projectCart,
} from "./cart"

type StoreCartApi = Pick<
  Medusa["store"]["cart"],
  "create" | "retrieve" | "createLineItem" | "updateLineItem" | "deleteLineItem"
>
type StoreRegionApi = Pick<Medusa["store"]["region"], "list">

const rawCart = {
  id: "cart_123",
  currency_code: "hkd",
  items: [{
    id: "line_123",
    variant_id: "variant_123",
    title: "Instax Mini Film Pack",
    thumbnail: "https://example.com/film.jpg",
    quantity: 2,
    unit_price: 78,
    subtotal: 156,
    variant: { product: { metadata: { commerce_mode: "retail" } } },
  }],
  subtotal: 156,
  shipping_total: 0,
  tax_total: 0,
  total: 156,
  email: null,
}

function cartResponse(cart = rawCart) {
  return { cart }
}

function createSdk() {
  const cart = {
    create: vi.fn(),
    retrieve: vi.fn(),
    createLineItem: vi.fn(),
    updateLineItem: vi.fn(),
    deleteLineItem: vi.fn(),
  } satisfies StoreCartApi
  const region = { list: vi.fn() } satisfies StoreRegionApi

  return { store: { cart, region } }
}

describe("cart adapter", () => {
  it("marks the Medusa cart adapter as server-only", async () => {
    const source = await readFile(fileURLToPath(new URL("./cart.ts", import.meta.url)), "utf8")
    expect(source).toMatch(/^import "server-only"/)
  })

  it("returns the canonical empty view without creating a Medusa cart", () => {
    expect(emptyCartView()).toEqual({
      id: null,
      currencyCode: "hkd",
      items: [],
      itemCount: 0,
      subtotal: { amount: 0, currencyCode: "hkd" },
      shippingTotal: { amount: 0, currencyCode: "hkd" },
      taxTotal: { amount: 0, currencyCode: "hkd" },
      total: { amount: 0, currencyCode: "hkd" },
      email: null,
    })
  })

  it("projects Medusa major-unit money into safe HKD integer cents", () => {
    expect(projectCart(rawCart)).toMatchObject({
      id: "cart_123",
      itemCount: 2,
      subtotal: { amount: 15_600, currencyCode: "hkd" },
      items: [{
        id: "line_123",
        kind: "retail",
        variantId: "variant_123",
        unitPrice: { amount: 7_800, currencyCode: "hkd" },
        subtotal: { amount: 15_600, currencyCode: "hkd" },
      }],
    })
  })

  it("projects photo-print attachment metadata into the canonical line view", () => {
    const photoCart = {
      ...rawCart,
      items: [{
        ...rawCart.items[0],
        metadata: {
          photo_job_version_id: "photo_version_123",
          photo_item_count: 7,
        },
        variant: { product: { metadata: { commerce_mode: "photo_print" } } },
      }],
    }
    expect(projectCart(photoCart).items[0]).toMatchObject({
      kind: "photo_print",
      photoJobVersionId: "photo_version_123",
      photoCount: 7,
    })
  })

  it("retrieves an existing cart through the concrete SDK method", async () => {
    const sdk = createSdk()
    sdk.store.cart.retrieve.mockResolvedValue(cartResponse())
    const adapter = createCartAdapter(sdk)

    await expect(adapter.retrieve("cart_123")).resolves.toMatchObject({ id: "cart_123" })
    expect(sdk.store.cart.retrieve).toHaveBeenCalledWith("cart_123", { fields: expect.any(String) })
  })

  it("finds the seeded Hong Kong region, creates a cart, and adds its first line", async () => {
    const sdk = createSdk()
    sdk.store.region.list.mockResolvedValue({
      regions: [{ id: "reg_hk", currency_code: "hkd", countries: [{ iso_2: "hk" }] }],
    })
    sdk.store.cart.create.mockResolvedValue(cartResponse({ ...rawCart, id: "cart_new", items: [] }))
    sdk.store.cart.createLineItem.mockResolvedValue(cartResponse({ ...rawCart, id: "cart_new" }))
    const adapter = createCartAdapter(sdk)

    await expect(adapter.createWithLine({ variantId: "variant_123", quantity: 2 })).resolves.toMatchObject({ id: "cart_new" })
    expect(sdk.store.region.list).toHaveBeenCalledWith({ fields: "id,currency_code,*countries" })
    expect(sdk.store.cart.create).toHaveBeenCalledWith({ region_id: "reg_hk" }, { fields: expect.any(String) })
    expect(sdk.store.cart.createLineItem).toHaveBeenCalledWith("cart_new", { variant_id: "variant_123", quantity: 2 }, { fields: expect.any(String) })
  })

  it("uses the SDK line mutation methods and returns only projections", async () => {
    const sdk = createSdk()
    sdk.store.cart.createLineItem.mockResolvedValue(cartResponse())
    sdk.store.cart.updateLineItem.mockResolvedValue(cartResponse())
    sdk.store.cart.deleteLineItem.mockResolvedValue({ deleted: true, parent: rawCart })
    const adapter = createCartAdapter(sdk)

    await adapter.addLine("cart_123", { variantId: "variant_123", quantity: 3 })
    await adapter.updateLine("cart_123", "line_123", 4)
    await adapter.removeLine("cart_123", "line_123")

    expect(sdk.store.cart.createLineItem).toHaveBeenCalledWith("cart_123", { variant_id: "variant_123", quantity: 3 }, { fields: expect.any(String) })
    expect(sdk.store.cart.updateLineItem).toHaveBeenCalledWith("cart_123", "line_123", { quantity: 4 }, { fields: expect.any(String) })
    expect(sdk.store.cart.deleteLineItem).toHaveBeenCalledWith("cart_123", "line_123", { fields: expect.any(String) })
  })

  it.each([
    [{ variantId: "", quantity: 1 }],
    [{ variantId: "variant_123", quantity: 0 }],
    [{ variantId: "variant_123", quantity: 1.5 }],
    [{ variantId: "variant_123", quantity: 100 }],
    [{ variantId: "variant_123", quantity: "1" }],
    [{ variantId: "variant_123", quantity: 1, extra: true }],
  ])("rejects invalid add input %#", (input) => {
    expect(() => parseAddCartItemInput(input)).toThrow(CartError)
  })

  it.each([0, 1.25, 100, "2", null])("rejects invalid line quantities %#", (quantity) => {
    expect(() => parseQuantityInput(quantity)).toThrow(CartError)
  })

  it("accepts an exact update-line payload", () => {
    expect(parseUpdateCartItemInput({ quantity: 2 })).toBe(2)
  })

  it.each([null, [], { quantity: 2, extra: true }, { quantity: "2" }])(
    "rejects invalid update-line payload %#",
    (input) => {
      expect(() => parseUpdateCartItemInput(input)).toThrow(CartError)
    },
  )
})
