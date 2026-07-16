import "server-only"
import type Medusa from "@medusajs/js-sdk"
import type { CustomerView, MoneyView } from "./contracts"

export interface LoginInput {
  email: string
  password: string
}

export interface RegistrationInput extends LoginInput {
  firstName: string
  lastName: string
}

export interface OrderView {
  id: string
  displayId: number
  createdAt: string
  total: MoneyView
  status: string
  fulfillmentStatus: string
}

export interface CustomerAuthSdk {
  auth: {
    register(actor: string, method: string, payload: Record<string, unknown>): Promise<unknown>
    login(actor: string, method: string, payload: Record<string, unknown>): Promise<unknown>
  }
  store: {
    customer: {
      create(body: Record<string, unknown>): Promise<{ customer: unknown }>
      retrieve(): Promise<{ customer: unknown }>
    }
    cart: {
      transferCart(id: string): Promise<unknown>
    }
    order: {
      list(): Promise<{ orders: unknown[] }>
      retrieve(id: string): Promise<{ order: unknown }>
    }
  }
}

export class AuthBoundaryError extends Error {
  constructor(readonly code:
    | "invalid_auth_input"
    | "unsupported_auth_response"
    | "invalid_customer_response"
    | "invalid_order_response"
  ) {
    super(code)
  }
}

function record(value: unknown, code: AuthBoundaryError["code"]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AuthBoundaryError(code)
  }
  return value as Record<string, unknown>
}

function stringValue(value: unknown, code: AuthBoundaryError["code"]): string {
  if (typeof value !== "string") throw new AuthBoundaryError(code)
  return value
}

function parseEmail(value: unknown): string {
  const email = stringValue(value, "invalid_auth_input").trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthBoundaryError("invalid_auth_input")
  }
  return email
}

function parsePassword(value: unknown): string {
  const password = stringValue(value, "invalid_auth_input")
  if (password.length < 8 || password.length > 128) {
    throw new AuthBoundaryError("invalid_auth_input")
  }
  return password
}

function parseName(value: unknown): string {
  const name = stringValue(value, "invalid_auth_input").trim()
  if (!name || name.length > 100) throw new AuthBoundaryError("invalid_auth_input")
  return name
}

function exactKeys(source: Record<string, unknown>, keys: string[]): void {
  const actual = Object.keys(source).sort()
  if (actual.length !== keys.length || actual.some((key, index) => key !== [...keys].sort()[index])) {
    throw new AuthBoundaryError("invalid_auth_input")
  }
}

export function parseLoginInput(value: unknown): LoginInput {
  const source = record(value, "invalid_auth_input")
  exactKeys(source, ["email", "password"])
  return { email: parseEmail(source.email), password: parsePassword(source.password) }
}

export function parseRegistrationInput(value: unknown): RegistrationInput {
  const source = record(value, "invalid_auth_input")
  exactKeys(source, ["email", "password", "firstName", "lastName"])
  return {
    email: parseEmail(source.email),
    password: parsePassword(source.password),
    firstName: parseName(source.firstName),
    lastName: parseName(source.lastName),
  }
}

function projectCustomer(value: unknown): CustomerView {
  const source = record(value, "invalid_customer_response")
  const id = stringValue(source.id, "invalid_customer_response")
  const email = stringValue(source.email, "invalid_customer_response")
  const firstName = source.first_name == null ? "" : stringValue(source.first_name, "invalid_customer_response")
  const lastName = source.last_name == null ? "" : stringValue(source.last_name, "invalid_customer_response")
  if (!id || !email) throw new AuthBoundaryError("invalid_customer_response")
  return { id, email, firstName, lastName }
}

function projectMoney(value: unknown): MoneyView {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new AuthBoundaryError("invalid_order_response")
  }
  const cents = Math.round(value * 100)
  if (!Number.isSafeInteger(cents) || Math.abs(value * 100 - cents) > Number.EPSILON * Math.max(1, value * 100) * 4) {
    throw new AuthBoundaryError("invalid_order_response")
  }
  return { amount: cents, currencyCode: "hkd" }
}

function projectOrder(value: unknown): OrderView {
  const source = record(value, "invalid_order_response")
  if (typeof source.display_id !== "number" || !Number.isInteger(source.display_id)) {
    throw new AuthBoundaryError("invalid_order_response")
  }
  return {
    id: stringValue(source.id, "invalid_order_response"),
    displayId: source.display_id,
    createdAt: stringValue(source.created_at, "invalid_order_response"),
    total: projectMoney(source.total),
    status: stringValue(source.status, "invalid_order_response"),
    fulfillmentStatus: stringValue(source.fulfillment_status, "invalid_order_response"),
  }
}

export function createCustomerAuthSdk(sdk: Medusa): CustomerAuthSdk {
  return {
    auth: {
      register: (actor, method, payload) => sdk.auth.register(actor, method, payload),
      login: (actor, method, payload) => sdk.auth.login(actor, method, payload),
    },
    store: {
      customer: {
        create: async (body) => sdk.store.customer.create(body),
        retrieve: async () => sdk.store.customer.retrieve(),
      },
      cart: {
        transferCart: (id) => sdk.store.cart.transferCart(id),
      },
      order: {
        list: async () => sdk.store.order.list({
          fields: "id,display_id,created_at,total,status,fulfillment_status",
          limit: 100,
        }),
        retrieve: async (id) => sdk.store.order.retrieve(id, {
          fields: "id,display_id,created_at,total,status,fulfillment_status",
        }),
      },
    },
  }
}

async function requireLoginToken(sdk: CustomerAuthSdk, input: LoginInput): Promise<string> {
  const result = await sdk.auth.login("customer", "emailpass", {
    email: input.email,
    password: input.password,
  })
  if (typeof result !== "string" || !result) {
    throw new AuthBoundaryError("unsupported_auth_response")
  }
  return result
}

export async function loginCustomer(
  sdk: CustomerAuthSdk,
  input: LoginInput,
  cartId?: string,
): Promise<{ token: string; customer: CustomerView }> {
  const token = await requireLoginToken(sdk, input)
  if (cartId) await sdk.store.cart.transferCart(cartId)
  const { customer } = await sdk.store.customer.retrieve()
  return { token, customer: projectCustomer(customer) }
}

export async function registerCustomer(
  sdk: CustomerAuthSdk,
  input: RegistrationInput,
  cartId?: string,
): Promise<{ token: string; customer: CustomerView }> {
  await sdk.auth.register("customer", "emailpass", {
    email: input.email,
    password: input.password,
  })
  const created = await sdk.store.customer.create({
    email: input.email,
    first_name: input.firstName,
    last_name: input.lastName,
  })
  const token = await requireLoginToken(sdk, input)
  if (cartId) await sdk.store.cart.transferCart(cartId)
  return { token, customer: projectCustomer(created.customer) }
}

export async function retrieveCustomer(sdk: CustomerAuthSdk): Promise<CustomerView> {
  return projectCustomer((await sdk.store.customer.retrieve()).customer)
}

export async function listCustomerOrders(sdk: CustomerAuthSdk): Promise<OrderView[]> {
  const response = await sdk.store.order.list()
  if (!Array.isArray(response.orders)) throw new AuthBoundaryError("invalid_order_response")
  return response.orders.map(projectOrder)
}

export async function retrieveCustomerOrder(sdk: CustomerAuthSdk, id: string): Promise<OrderView> {
  if (!id.trim()) throw new AuthBoundaryError("invalid_auth_input")
  return projectOrder((await sdk.store.order.retrieve(id)).order)
}
