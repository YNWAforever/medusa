import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  AuthBoundaryError,
  listCustomerOrders,
  loginCustomer,
  parseLoginInput,
  parseRegistrationInput,
  registerCustomer,
  retrieveCustomerOrder,
  type CustomerAuthSdk,
} from "./auth"

const customer = {
  id: "cus_123",
  email: "customer@example.com",
  first_name: "Ada",
  last_name: "Lovelace",
}

function sdk(): CustomerAuthSdk {
  return {
    auth: { register: vi.fn(), login: vi.fn() },
    store: {
      customer: { create: vi.fn(), retrieve: vi.fn() },
      cart: { transferCart: vi.fn() },
      order: { list: vi.fn(), retrieve: vi.fn() },
    },
  }
}

const registration = {
  email: "customer@example.com",
  password: "correct-horse",
  firstName: "Ada",
  lastName: "Lovelace",
}

describe("Medusa customer auth boundary", () => {
  it("is server-only and registers, creates, logs in, and transfers the guest cart", async () => {
    const source = await readFile(fileURLToPath(new URL("./auth.ts", import.meta.url)), "utf8")
    const client = sdk()
    vi.mocked(client.auth.register).mockResolvedValue("registration_token")
    vi.mocked(client.store.customer.create).mockResolvedValue({ customer })
    vi.mocked(client.auth.login).mockResolvedValue("customer_token")
    vi.mocked(client.store.cart.transferCart).mockResolvedValue({ cart: {} })

    await expect(registerCustomer(client, registration, "cart_123")).resolves.toEqual({
      token: "customer_token",
      customer: { id: "cus_123", email: "customer@example.com", firstName: "Ada", lastName: "Lovelace" },
    })
    expect(source).toMatch(/^import "server-only"/)
    expect(client.auth.register).toHaveBeenCalledWith("customer", "emailpass", {
      email: registration.email,
      password: registration.password,
    })
    expect(client.store.customer.create).toHaveBeenCalledWith({
      email: registration.email,
      first_name: registration.firstName,
      last_name: registration.lastName,
    })
    expect(client.auth.login).toHaveBeenCalledWith("customer", "emailpass", {
      email: registration.email,
      password: registration.password,
    })
    expect(client.store.cart.transferCart).toHaveBeenCalledWith("cart_123")
  })

  it("accepts only a string login token and never transfers on unsupported auth responses", async () => {
    const client = sdk()
    vi.mocked(client.auth.login).mockResolvedValue({ location: "https://example.com" })
    await expect(loginCustomer(client, { email: registration.email, password: registration.password }, "cart_123"))
      .rejects.toMatchObject({ code: "unsupported_auth_response" })
    expect(client.store.cart.transferCart).not.toHaveBeenCalled()
  })

  it("logs in, transfers an optional cart, and projects the authenticated customer", async () => {
    const client = sdk()
    vi.mocked(client.auth.login).mockResolvedValue("customer_token")
    vi.mocked(client.store.cart.transferCart).mockResolvedValue({ cart: {} })
    vi.mocked(client.store.customer.retrieve).mockResolvedValue({ customer })

    await expect(loginCustomer(client, { email: registration.email, password: registration.password }, "cart_123"))
      .resolves.toEqual({
        token: "customer_token",
        customer: { id: "cus_123", email: "customer@example.com", firstName: "Ada", lastName: "Lovelace" },
      })
    expect(client.store.cart.transferCart).toHaveBeenCalledWith("cart_123")
  })

  it("strictly validates login and registration input", () => {
    expect(() => parseLoginInput({ email: "bad", password: "short" })).toThrow(AuthBoundaryError)
    expect(() => parseLoginInput({ email: registration.email, password: registration.password, extra: true })).toThrow(AuthBoundaryError)
    expect(() => parseRegistrationInput({ ...registration, firstName: "", extra: true })).toThrow(AuthBoundaryError)
    expect(parseRegistrationInput(registration)).toEqual(registration)
  })

  it("projects authenticated order history into integer HKD cents", async () => {
    const client = sdk()
    vi.mocked(client.store.order.list).mockResolvedValue({
      orders: [{
        id: "order_123",
        display_id: 42,
        created_at: "2026-07-12T10:00:00.000Z",
        total: 78,
        status: "completed",
        fulfillment_status: "fulfilled",
      }],
    })

    await expect(listCustomerOrders(client)).resolves.toEqual([{
      id: "order_123",
      displayId: 42,
      createdAt: "2026-07-12T10:00:00.000Z",
      total: { amount: 7800, currencyCode: "hkd" },
      status: "completed",
      fulfillmentStatus: "fulfilled",
    }])
  })

  it("retrieves orders only through the authenticated customer SDK boundary", async () => {
    const client = sdk()
    vi.mocked(client.store.order.retrieve).mockRejectedValue(Object.assign(new Error("missing"), { status: 404 }))
    await expect(retrieveCustomerOrder(client, "order_other")).rejects.toMatchObject({ status: 404 })
  })
})
