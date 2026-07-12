import { describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { CART_COOKIE } from "./lib/medusa/session"

const cart = {
  id: "cart_123",
  currencyCode: "hkd" as const,
  items: [],
  itemCount: 0,
  subtotal: { amount: 0, currencyCode: "hkd" as const },
  shippingTotal: { amount: 0, currencyCode: "hkd" as const },
  taxTotal: { amount: 0, currencyCode: "hkd" as const },
  total: { amount: 0, currencyCode: "hkd" as const },
  email: null,
}

const retrieve = vi.fn()
const createWithLine = vi.fn()
const addLine = vi.fn()
const updateLine = vi.fn()
const removeLine = vi.fn()

vi.mock("./lib/medusa/cart", () => ({
  CartError: class CartError extends Error { constructor(readonly code: string) { super(code) } },
  createCartAdapter: () => ({ retrieve, createWithLine, addLine, updateLine, removeLine }),
  emptyCartView: () => ({ ...cart, id: null }),
  parseAddCartItemInput: (value: { variantId?: string; quantity?: number }) => {
    if (!value.variantId || !Number.isInteger(value.quantity) || value.quantity! < 1 || value.quantity! > 99) {
      throw new SyntaxError("invalid_cart_input")
    }
    return { variantId: value.variantId, quantity: value.quantity }
  },
  parseQuantityInput: (value: number) => {
    if (!Number.isInteger(value) || value < 1 || value > 99) {
      throw new SyntaxError("invalid_cart_input")
    }
    return value
  },
}))
vi.mock("./lib/medusa/client", () => ({ createStoreSdk: vi.fn() }))

import { GET } from "../app/api/cart/route"
import { POST } from "../app/api/cart/items/route"
import { DELETE, PATCH } from "../app/api/cart/items/[lineId]/route"

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`http://storefront.test${path}`, init)
}

describe("cart BFF", () => {
  it("returns an empty canonical cart without creating a cart when no cookie exists", async () => {
    const response = await GET(request("/api/cart"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ cart: { ...cart, id: null } })
    expect(retrieve).not.toHaveBeenCalled()
    expect(createWithLine).not.toHaveBeenCalled()
  })

  it("returns only a projected cart for a valid cookie", async () => {
    retrieve.mockResolvedValue(cart)
    const response = await GET(request("/api/cart", { headers: { cookie: `${CART_COOKIE}=cart_123` } }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ cart })
    expect(JSON.stringify(body)).not.toContain("set-cookie")

  })

  it("clears a stale cookie and returns a recoverable expiration code", async () => {
    retrieve.mockRejectedValue(Object.assign(new Error("missing"), { status: 404 }))
    const response = await GET(request("/api/cart", { headers: { cookie: `${CART_COOKIE}=cart_stale` } }))

    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toEqual({ error: { code: "cart_expired" } })
    expect(response.cookies.get(CART_COOKIE)?.value).toBe("")
  })

  it("creates on the first valid add and sets the HttpOnly cookie outside JSON", async () => {
    createWithLine.mockResolvedValue({ ...cart, id: "cart_new" })
    const response = await POST(request("/api/cart/items", {
      method: "POST",
      body: JSON.stringify({ variantId: "variant_123", quantity: 2 }),
      headers: { "content-type": "application/json" },
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(createWithLine).toHaveBeenCalledWith({ variantId: "variant_123", quantity: 2 })
    expect(response.cookies.get(CART_COOKIE)?.value).toBe("cart_new")
    expect(JSON.stringify(body)).toEqual(JSON.stringify({ cart: { ...cart, id: "cart_new" } }))
  })

  it("adds to an existing cart and maps Medusa conflicts to a recoverable code", async () => {
    addLine.mockResolvedValue(cart)
    const success = await POST(request("/api/cart/items", {
      method: "POST",
      body: JSON.stringify({ variantId: "variant_123", quantity: 1 }),
      headers: { "content-type": "application/json", cookie: `${CART_COOKIE}=cart_123` },
    }))
    expect(success.status).toBe(200)
    expect(addLine).toHaveBeenCalledWith("cart_123", { variantId: "variant_123", quantity: 1 })

    addLine.mockRejectedValueOnce(Object.assign(new Error("conflict"), { status: 409 }))
    const conflict = await POST(request("/api/cart/items", {
      method: "POST",
      body: JSON.stringify({ variantId: "variant_123", quantity: 1 }),
      headers: { "content-type": "application/json", cookie: `${CART_COOKIE}=cart_123` },
    }))
    await expect(conflict.json()).resolves.toEqual({ error: { code: "cart_conflict" } })
  })

  it.each(["{", JSON.stringify({ variantId: "", quantity: 1 }), JSON.stringify({ variantId: "variant_123", quantity: 1.5 })])("rejects malformed add bodies", async (body) => {
    const response = await POST(request("/api/cart/items", { method: "POST", body, headers: { "content-type": "application/json" } }))
    expect(response.status).toBe(400)
  })

  it("updates and deletes line items with valid quantities", async () => {
    updateLine.mockResolvedValue(cart)
    removeLine.mockResolvedValue(cart)
    const patch = await PATCH(request("/api/cart/items/line_123", {
      method: "PATCH",
      body: JSON.stringify({ quantity: 4 }),
      headers: { "content-type": "application/json", cookie: `${CART_COOKIE}=cart_123` },
    }), { params: Promise.resolve({ lineId: "line_123" }) })
    const remove = await DELETE(request("/api/cart/items/line_123", { method: "DELETE", headers: { cookie: `${CART_COOKIE}=cart_123` } }), { params: Promise.resolve({ lineId: "line_123" }) })

    expect(patch.status).toBe(200)
    expect(remove.status).toBe(200)
    expect(updateLine).toHaveBeenCalledWith("cart_123", "line_123", 4)
    expect(removeLine).toHaveBeenCalledWith("cart_123", "line_123")
  })
})
