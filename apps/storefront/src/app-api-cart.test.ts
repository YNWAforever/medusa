import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))
import { CART_COOKIE } from "./lib/medusa/session"
import { CartError } from "./lib/medusa/cart"

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

const cartWithLine = {
  ...cart,
  items: [{ id: "line_123" }],
  itemCount: 1,
}

const {
  retrieve,
  createWithLine,
  addLine,
  updateLine,
  removeLine,
  createStoreSdk,
} = vi.hoisted(() => ({
  retrieve: vi.fn(),
  createWithLine: vi.fn(),
  addLine: vi.fn(),
  updateLine: vi.fn(),
  removeLine: vi.fn(),
  createStoreSdk: vi.fn(),
}))

function strictQuantityBody(value: unknown): number {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || Object.keys(value).length !== 1
    || !Object.hasOwn(value, "quantity")
  ) {
    throw new SyntaxError("invalid_cart_input")
  }

  const quantity = Reflect.get(value, "quantity")
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new SyntaxError("invalid_cart_input")
  }

  return quantity
}

vi.mock("./lib/medusa/cart", () => ({
  CartError: class CartError extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  },
  createCartAdapter: () => ({ retrieve, createWithLine, addLine, updateLine, removeLine }),
  emptyCartView: () => ({ ...cart, id: null }),
  parseAddCartItemInput: (value: { variantId?: string; quantity?: number }) => {
    if (
      !value.variantId
      || Object.keys(value).length !== 2
      || !Number.isInteger(value.quantity)
      || value.quantity! < 1
      || value.quantity! > 99
    ) {
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
  parseUpdateCartItemInput: strictQuantityBody,
}))
vi.mock("./lib/medusa/client", () => ({ createStoreSdk }))

import { GET } from "../app/api/cart/route"
import { POST } from "../app/api/cart/items/route"
import { DELETE, PATCH } from "../app/api/cart/items/[lineId]/route"

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest("http://storefront.test" + path, init)
}

function cartCookie(id = "cart_123") {
  return { cookie: CART_COOKIE + "=" + id }
}

function patchRequest(body: string, cartId = "cart_123") {
  return request("/api/cart/items/line_123", {
    method: "PATCH",
    body,
    headers: { "content-type": "application/json", ...cartCookie(cartId) },
  })
}

function deleteRequest(cartId = "cart_123") {
  return request("/api/cart/items/line_123", {
    method: "DELETE",
    headers: cartCookie(cartId),
  })
}

beforeEach(() => {
  for (const mock of [retrieve, createWithLine, addLine, updateLine, removeLine, createStoreSdk]) {
    mock.mockReset()
  }
  createStoreSdk.mockResolvedValue({})
  retrieve.mockResolvedValue(cart)
  createWithLine.mockResolvedValue({ ...cart, id: "cart_new" })
  addLine.mockResolvedValue(cart)
  updateLine.mockResolvedValue(cart)
  removeLine.mockResolvedValue(cart)
})

describe("cart BFF", () => {
  it("returns an empty canonical cart without creating a cart when no cookie exists", async () => {
    const response = await GET(request("/api/cart"))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ cart: { ...cart, id: null } })
    expect(retrieve).not.toHaveBeenCalled()
    expect(createWithLine).not.toHaveBeenCalled()
  })

  it("returns only a projected cart for a valid cookie", async () => {
    const response = await GET(request("/api/cart", { headers: cartCookie() }))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toEqual({ cart })
    expect(JSON.stringify(body)).not.toContain("set-cookie")
  })

  it("clears a stale cookie and returns a recoverable expiration code", async () => {
    retrieve.mockRejectedValueOnce(Object.assign(new Error("missing"), { status: 404 }))
    const response = await GET(request("/api/cart", { headers: cartCookie("cart_stale") }))
    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toEqual({ error: { code: "cart_expired" } })
    expect(response.cookies.get(CART_COOKIE)?.value).toBe("")
  })

  it("creates on the first valid add and sets the HttpOnly cookie outside JSON", async () => {
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
    expect(JSON.stringify(body)).not.toContain(CART_COOKIE)
  })

  it("maps SDK initialization failures on add to cart_unavailable", async () => {
    createStoreSdk.mockRejectedValueOnce(new Error("missing config"))
    const response = await POST(request("/api/cart/items", {
      method: "POST",
      body: JSON.stringify({ variantId: "variant_123", quantity: 1 }),
      headers: { "content-type": "application/json" },
    }))
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({ error: { code: "cart_unavailable" } })
  })

  it("maps missing HK region configuration to service unavailable", async () => {
    createWithLine.mockRejectedValueOnce(new CartError("cart_region_unavailable"))
    const response = await POST(request("/api/cart/items", {
      method: "POST",
      body: JSON.stringify({ variantId: "variant_123", quantity: 1 }),
      headers: { "content-type": "application/json" },
    }))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: { code: "cart_region_unavailable" } })
  })

  it("adds to an existing cart and maps Medusa conflicts to a recoverable code", async () => {
    const success = await POST(request("/api/cart/items", {
      method: "POST",
      body: JSON.stringify({ variantId: "variant_123", quantity: 1 }),
      headers: { "content-type": "application/json", ...cartCookie() },
    }))
    expect(success.status).toBe(200)
    expect(addLine).toHaveBeenCalledWith("cart_123", { variantId: "variant_123", quantity: 1 })

    addLine.mockRejectedValueOnce(Object.assign(new Error("conflict"), { status: 409 }))
    const conflict = await POST(request("/api/cart/items", {
      method: "POST",
      body: JSON.stringify({ variantId: "variant_123", quantity: 1 }),
      headers: { "content-type": "application/json", ...cartCookie() },
    }))
    expect(conflict.status).toBe(409)
    await expect(conflict.json()).resolves.toEqual({ error: { code: "cart_conflict" } })
  })

  it.each([
    "{",
    JSON.stringify({ variantId: "", quantity: 1 }),
    JSON.stringify({ variantId: "variant_123", quantity: 1.5 }),
    JSON.stringify({ variantId: "variant_123", quantity: 1, extra: true }),
  ])("rejects malformed add bodies", async (body) => {
    const response = await POST(request("/api/cart/items", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    }))
    expect(response.status).toBe(400)
  })

  it("updates and deletes line items with valid quantities after confirming the cart", async () => {
    retrieve.mockResolvedValue(cartWithLine)
    const patch = await PATCH(patchRequest(JSON.stringify({ quantity: 4 })), {
      params: Promise.resolve({ lineId: "line_123" }),
    })
    const remove = await DELETE(deleteRequest(), {
      params: Promise.resolve({ lineId: "line_123" }),
    })
    expect(patch.status).toBe(200)
    expect(remove.status).toBe(200)
    expect(retrieve).toHaveBeenCalledWith("cart_123")
    expect(updateLine).toHaveBeenCalledWith("cart_123", "line_123", 4)
    expect(removeLine).toHaveBeenCalledWith("cart_123", "line_123")
  })

  it.each([
    "null",
    "[]",
    "{}",
    JSON.stringify({ quantity: 1, extra: true }),
    JSON.stringify({ quantity: 1.5 }),
    JSON.stringify({ quantity: 100 }),
  ])("rejects malformed PATCH bodies strictly: %s", async (body) => {
    const response = await PATCH(patchRequest(body), {
      params: Promise.resolve({ lineId: "line_123" }),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: { code: "invalid_cart_input" } })
    expect(updateLine).not.toHaveBeenCalled()
  })

  it.each([
    ["PATCH", async () => PATCH(
      patchRequest(JSON.stringify({ quantity: 2 }), "cart_stale"),
      { params: Promise.resolve({ lineId: "line_123" }) },
    )],
    ["DELETE", async () => DELETE(
      deleteRequest("cart_stale"),
      { params: Promise.resolve({ lineId: "line_123" }) },
    )],
  ] as const)("clears a stale cart cookie before %s", async (_method, invoke) => {
    retrieve.mockRejectedValueOnce(Object.assign(new Error("missing cart"), { status: 404 }))
    const response = await invoke()
    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toEqual({ error: { code: "cart_expired" } })
    expect(response.cookies.get(CART_COOKIE)?.value).toBe("")
    expect(updateLine).not.toHaveBeenCalled()
    expect(removeLine).not.toHaveBeenCalled()
  })

  it.each([
    ["PATCH", async () => {
      updateLine.mockRejectedValueOnce(Object.assign(new Error("missing line"), { status: 404 }))
      return PATCH(patchRequest(JSON.stringify({ quantity: 2 })), {
        params: Promise.resolve({ lineId: "line_missing" }),
      })
    }],
    ["DELETE", async () => {
      removeLine.mockRejectedValueOnce(Object.assign(new Error("missing line"), { status: 404 }))
      return DELETE(deleteRequest(), {
        params: Promise.resolve({ lineId: "line_missing" }),
      })
    }],
  ] as const)("preserves a valid cart cookie when %s targets a missing line", async (_method, invoke) => {
    const response = await invoke()
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: { code: "cart_line_not_found" } })
    expect(response.cookies.get(CART_COOKIE)).toBeUndefined()
    expect(updateLine).not.toHaveBeenCalled()
    expect(removeLine).not.toHaveBeenCalled()
  })
})
