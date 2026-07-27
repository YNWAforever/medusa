import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  createStoreSdk,
  registerCustomer,
  loginCustomer,
  retrieveCustomer,
  listCustomerOrders,
} = vi.hoisted(() => ({
  createStoreSdk: vi.fn(),
  registerCustomer: vi.fn(),
  loginCustomer: vi.fn(),
  retrieveCustomer: vi.fn(),
  listCustomerOrders: vi.fn(),
}))


vi.mock("./lib/medusa/client", () => ({ createStoreSdk }))
vi.mock("./lib/medusa/auth", () => ({
  AuthBoundaryError: class AuthBoundaryError extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  },
  createCustomerAuthSdk: () => ({}),
  parseLoginInput: (value: unknown) => value,
  parseRegistrationInput: (value: unknown) => value,
  registerCustomer,
  loginCustomer,
  retrieveCustomer,
  listCustomerOrders,
}))

import { POST as register } from "../app/api/auth/register/route"
import { POST as login } from "../app/api/auth/login/route"
import { POST as logout } from "../app/api/auth/logout/route"
import { GET as account } from "../app/api/account/route"
import { GET as orders } from "../app/api/account/orders/route"

const CUSTOMER_COOKIE = "fm_customer_token"
const customer = { id: "cus_123", email: "customer@example.com", firstName: "Ada", lastName: "Lovelace" }

function request(path: string, init: { method?: string; body?: string; headers?: HeadersInit } = {}, cookies: Record<string, string> = {}) {
  const cookie = Object.entries(cookies).map(([key, value]) => key + "=" + value).join("; ")
  return new NextRequest("http://localhost" + path, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...init.headers,
    },
  })
}

beforeEach(() => {
  for (const mock of [createStoreSdk, registerCustomer, loginCustomer, retrieveCustomer, listCustomerOrders]) {
    mock.mockReset()
  }
  createStoreSdk.mockResolvedValue({})
  registerCustomer.mockResolvedValue({ token: "jwt_registration", customer })
  loginCustomer.mockResolvedValue({ token: "jwt_login", customer })
  retrieveCustomer.mockResolvedValue(customer)
  listCustomerOrders.mockResolvedValue([])
})

describe("customer auth BFF", () => {
  it.each([
    ["register", register, "/api/auth/register", { email: "customer@example.com", password: "correct-horse", firstName: "Ada", lastName: "Lovelace" }, registerCustomer],
    ["login", login, "/api/auth/login", { email: "customer@example.com", password: "correct-horse" }, loginCustomer],
  ] as const)("sets an eight-hour HttpOnly token outside JSON on %s", async (_name, handler, path, body, operation) => {
    const response = await handler(request(path, {
      method: "POST",
      body: JSON.stringify(body),
    }, { fm_cart_id: "cart_123" }))
    const json = await response.json()
    const setCookie = response.headers.get("set-cookie") ?? ""

    expect(response.status).toBe(200)
    expect(json).toEqual({ customer })
    expect(JSON.stringify(json)).not.toContain("jwt_")
    expect(setCookie).toContain(CUSTOMER_COOKIE + "=")
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
    expect(setCookie).toMatch(/Max-Age=28800/i)
    expect(operation).toHaveBeenCalledWith(expect.anything(), body, "cart_123")
  })

  it("maps invalid credentials without setting a customer token", async () => {
    loginCustomer.mockRejectedValueOnce(Object.assign(new Error("invalid credentials"), { status: 401 }))
    const response = await login(request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "customer@example.com", password: "wrong-pass" }),
    }))
    expect(response.status).toBe(401)
    expect(response.headers.get("set-cookie")).toBeNull()
    await expect(response.json()).resolves.toEqual({ error: { code: "invalid_credentials" } })
  })

  it("requires a token for account and order history", async () => {
    const accountResponse = await account(request("/api/account"))
    const ordersResponse = await orders(request("/api/account/orders"))
    expect(accountResponse.status).toBe(401)
    expect(ordersResponse.status).toBe(401)
    expect(createStoreSdk).not.toHaveBeenCalled()
  })

  it("uses a fresh token-bound SDK and returns DTOs without the JWT", async () => {
    const response = await account(request("/api/account", {}, { [CUSTOMER_COOKIE]: "jwt_customer" }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ customer })
    expect(createStoreSdk).toHaveBeenCalledWith("jwt_customer")
  })

  it("clears an expired customer token", async () => {
    retrieveCustomer.mockRejectedValueOnce(Object.assign(new Error("expired"), { status: 401 }))
    const response = await account(request("/api/account", {}, { [CUSTOMER_COOKIE]: "jwt_expired" }))
    expect(response.status).toBe(401)
    expect(response.cookies.get(CUSTOMER_COOKIE)?.value).toBe("")
    await expect(response.json()).resolves.toEqual({ error: { code: "session_expired" } })
  })

  it("returns authenticated order history without token leakage", async () => {
    listCustomerOrders.mockResolvedValueOnce([{ id: "order_123" }])
    const response = await orders(request("/api/account/orders", {}, { [CUSTOMER_COOKIE]: "jwt_customer" }))
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json).toEqual({ orders: [{ id: "order_123" }] })
    expect(JSON.stringify(json)).not.toContain("jwt_customer")
  })

  it("logout expires the customer token and the cart cookie together", async () => {
    const response = await logout()

    expect(response.status).toBe(200)
    expect(response.cookies.get(CUSTOMER_COOKIE)?.value).toBe("")
    expect(response.cookies.get(CUSTOMER_COOKIE)?.maxAge).toBe(0)

    // Login calls Medusa transferCart, so the cart belongs to the customer for
    // good. Keeping fm_cart_id would attribute the next guest's order to them.
    expect(response.cookies.get("fm_cart_id")?.value).toBe("")
    expect(response.cookies.get("fm_cart_id")?.maxAge).toBe(0)
  })
})
