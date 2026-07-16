import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { CART_COOKIE } from "./lib/medusa/session"

const { createStoreSdk, getBranchAvailability } = vi.hoisted(() => ({
  createStoreSdk: vi.fn(),
  getBranchAvailability: vi.fn(),
}))

vi.mock("./lib/medusa/client", () => ({ createStoreSdk }))
vi.mock("./lib/medusa/branches", () => ({
  createBranchStoreClient: () => ({ fetch: vi.fn() }),
  getBranchAvailability,
}))

import { GET } from "../app/api/branches/route"

function request(query: string, cartId = "cart_123") {
  return new NextRequest("http://localhost/api/branches?" + query, {
    headers: { cookie: `${CART_COOKIE}=${cartId}` },
  })
}

beforeEach(() => {
  createStoreSdk.mockReset()
  getBranchAvailability.mockReset()
  createStoreSdk.mockResolvedValue({})
  getBranchAvailability.mockResolvedValue([])
})

describe("branch availability BFF", () => {
  it("projects locale for the cookie-scoped cart", async () => {
    const response = await GET(request("cartId=cart_123&locale=zh-HK"))
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    await expect(response.json()).resolves.toEqual({ branches: [] })
    expect(getBranchAvailability).toHaveBeenCalledWith("cart_123", "zh-HK", expect.objectContaining({ fetch: expect.any(Function) }))
  })

  it("rejects arbitrary cart access outside the HttpOnly cookie scope", async () => {
    const response = await GET(request("cartId=cart_other&locale=en"))
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: { code: "cart_scope_mismatch" } })
    expect(getBranchAvailability).not.toHaveBeenCalled()
  })

  it("clears an expired cart cookie when Medusa returns 404", async () => {
    getBranchAvailability.mockRejectedValueOnce(Object.assign(new Error("missing"), { status: 404 }))
    const response = await GET(request("cartId=cart_123&locale=en"))
    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toEqual({ error: { code: "cart_expired" } })
    expect(response.cookies.get(CART_COOKIE)?.value).toBe("")
  })

  it.each(["cartId=&locale=en", "cartId=cart_123&locale=fr"])("rejects invalid query input: %s", async (query) => {
    const response = await GET(request(query))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: { code: "invalid_branch_query" } })
  })
})
