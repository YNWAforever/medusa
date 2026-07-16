import { describe, expect, it, vi } from "vitest"

import { proxyToMedusa } from "./proxy"

describe("proxyToMedusa", () => {
  it("forwards method, URL, body, and a generated request ID", async () => {
    const fetch = vi.fn(async (request: Request) => {
      expect(request.method).toBe("POST")
      expect(request.url).toBe("https://api.example/store/carts")
      expect(await request.text()).toBe('{"region_id":"reg_1"}')
      expect(request.headers.get("x-request-id")).toBe("request-123")
      return Response.json({ id: "cart_1" }, { status: 201 })
    })

    const response = await proxyToMedusa(
      new Request("https://api.example/store/carts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"region_id":"reg_1"}',
      }),
      () => ({ fetch }),
      () => "request-123",
    )

    expect(response.status).toBe(201)
    expect(response.headers.get("x-request-id")).toBe("request-123")
    expect(await response.json()).toEqual({ id: "cart_1" })
  })

  it("preserves an incoming request ID", async () => {
    const fetch = vi.fn(async (request: Request) => {
      expect(request.headers.get("x-request-id")).toBe("client-request")
      return new Response(null, { status: 204 })
    })

    const response = await proxyToMedusa(
      new Request("https://api.example/health", {
        headers: { "x-request-id": "client-request" },
      }),
      () => ({ fetch }),
    )

    expect(response.headers.get("x-request-id")).toBe("client-request")
  })

  it("returns a stable secret-free 503 when the container is unavailable", async () => {
    const response = await proxyToMedusa(
      new Request("https://api.example/store/products"),
      () => ({
        fetch: async () => {
          throw new Error("redis-password-must-not-leak")
        },
      }),
      () => "request-503",
      () => {},
    )

    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("x-request-id")).toBe("request-503")
    expect(await response.json()).toEqual({
      code: "MEDUSA_UNAVAILABLE",
      request_id: "request-503",
    })
  })

  it("logs only safe request metadata without query strings or headers", async () => {
    const logEvent = vi.fn()
    const times = [100, 125]

    await proxyToMedusa(
      new Request("https://api.example/store/products?token=must-not-log", {
        headers: { authorization: "must-not-log" },
      }),
      () => ({ fetch: async () => new Response(null, { status: 204 }) }),
      () => "request-log",
      logEvent,
      () => times.shift() ?? 125,
    )

    expect(logEvent).toHaveBeenCalledWith({
      request_id: "request-log",
      method: "GET",
      pathname: "/store/products",
      status: 204,
      duration_ms: 25,
    })
  })
})
