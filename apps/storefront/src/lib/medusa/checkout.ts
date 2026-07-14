import "server-only"
import type { HttpTypes } from "@medusajs/types"
import Medusa from "@medusajs/js-sdk"
import type {
  CartView,
  CheckoutState,
  CommerceMode,
  FulfillmentChoice,
  Locale,
  MoneyView,
} from "./contracts"
import { projectCart, type MedusaCart } from "./cart"
import type { BranchView } from "./branches"

export const SYSTEM_PAYMENT_PROVIDER_ID = "pp_system_default"

export type CheckoutErrorCode =
  | "invalid_checkout_input"
  | "missing_delivery_address"
  | "incompatible_branch"
  | "inventory_conflict"
  | "stale_checkout_total"
  | "payment_session_failed"
  | "duplicate_completion"
  | "empty_cart"
  | "shipping_unavailable"
  | "system_payment_unavailable"
  | "cart_expired"
  | "checkout_unavailable"

export class CheckoutError extends Error {
  constructor(readonly code: CheckoutErrorCode) {
    super(code)
  }
}

export interface CheckoutAddress {
  address1: string
  address2: string | null
  city: string
  postalCode: string
  countryCode: "hk"
}

export interface ContactInput {
  email: string
  firstName: string
  lastName: string
  phone: string
  address: CheckoutAddress | null
}

export type FulfillmentInput =
  | { kind: "delivery"; shippingOptionId: string; branchHandle: null }
  | { kind: "pickup"; shippingOptionId: string; branchHandle: string }

export interface ShippingOptionView {
  id: string
  kind: "delivery" | "pickup"
  branchHandle: string | null
  label: string
  description: string
  price: MoneyView
  compatible: boolean
  reasonCode: string | null
  stagingLabel: string | null
  pickupAddress?: CheckoutAddress | null
}

export interface PaymentView {
  id: string
  providerId: string
  status: string
}

export interface CheckoutView extends CheckoutState {
  shippingOptions: ShippingOptionView[]
  paymentProviderId: string | null
}

export interface OrderConfirmationView {
  orderId: string
  displayId: number
  email: string
  total: MoneyView
  fulfillmentKind: "delivery" | "pickup"
  createdAt: string
}

type SelectParams = HttpTypes.SelectParams

export interface CheckoutSdk {
  store: {
    cart: {
      retrieve(id: string, query?: SelectParams): Promise<{ cart: unknown }>
      update(id: string, body: Record<string, unknown>, query?: SelectParams): Promise<{ cart: unknown }>
      addShippingMethod(id: string, body: Record<string, unknown>, query?: SelectParams): Promise<{ cart: unknown }>
      complete(id: string, query?: SelectParams): Promise<unknown>
    }
    fulfillment: {
      listCartOptions(query: Record<string, unknown>): Promise<{ shipping_options: unknown[] }>
    }
    payment: {
      listPaymentProviders(query: Record<string, unknown>): Promise<{ payment_providers: unknown[] }>
      initiatePaymentSession(cart: unknown, body: Record<string, unknown>, query?: SelectParams): Promise<{ payment_collection: unknown }>
    }
  }
}

const checkoutFields = "id,region_id,currency_code,email,subtotal,shipping_total,tax_total,total,*shipping_address,*items,*items.variant,*items.variant.product,*shipping_methods"
const orderFields = "id,display_id,email,total,currency_code,created_at"

function record(value: unknown, code: CheckoutErrorCode = "checkout_unavailable"): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CheckoutError(code)
  }
  return value as Record<string, unknown>
}

function requiredString(value: unknown, code = "invalid_checkout_input" as CheckoutErrorCode): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new CheckoutError(code)
  return value.trim()
}

function exactKeys(source: Record<string, unknown>, keys: string[]): void {
  const actual = Object.keys(source).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new CheckoutError("invalid_checkout_input")
  }
}

function parseEmail(value: unknown): string {
  const email = requiredString(value).toLowerCase()
  if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) throw new CheckoutError("invalid_checkout_input")
  return email
}

function parseAddress(value: unknown): CheckoutAddress | null {
  if (value === null) return null
  const source = record(value)
  exactKeys(source, ["address1", "address2", "city", "postalCode", "countryCode"])
  const countryCode = requiredString(source.countryCode).toLowerCase()
  if (countryCode !== "hk") throw new CheckoutError("missing_delivery_address")
  const address2 = source.address2 === null ? null : requiredString(source.address2)
  return {
    address1: requiredString(source.address1),
    address2,
    city: requiredString(source.city),
    postalCode: requiredString(source.postalCode),
    countryCode: "hk",
  }
}

export function parseContactInput(value: unknown): ContactInput {
  const source = record(value)
  exactKeys(source, ["email", "firstName", "lastName", "phone", "address"])
  const phone = requiredString(source.phone)
  if (phone.length > 40) throw new CheckoutError("invalid_checkout_input")
  return {
    email: parseEmail(source.email),
    firstName: requiredString(source.firstName),
    lastName: requiredString(source.lastName),
    phone,
    address: parseAddress(source.address),
  }
}

export function parseFulfillmentInput(value: unknown): FulfillmentInput {
  const source = record(value)
  exactKeys(source, ["kind", "shippingOptionId", "branchHandle"])
  const kind = source.kind
  const shippingOptionId = requiredString(source.shippingOptionId)
  if (kind === "delivery" && source.branchHandle === null) {
    return { kind, shippingOptionId, branchHandle: null }
  }
  if (kind === "pickup" && typeof source.branchHandle === "string" && source.branchHandle.trim()) {
    return { kind, shippingOptionId, branchHandle: source.branchHandle.trim() }
  }
  throw new CheckoutError("invalid_checkout_input")
}

export function parsePaymentInput(value: unknown): { providerId: string } {
  const source = record(value)
  exactKeys(source, ["providerId"])
  const providerId = requiredString(source.providerId)
  if (providerId !== SYSTEM_PAYMENT_PROVIDER_ID) throw new CheckoutError("system_payment_unavailable")
  return { providerId }
}

function projectMoney(value: unknown): MoneyView {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new CheckoutError("checkout_unavailable")
  }
  const cents = Math.round(value * 100)
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(value * 100)) * 4
  if (!Number.isSafeInteger(cents) || Math.abs(value * 100 - cents) > tolerance) {
    throw new CheckoutError("checkout_unavailable")
  }
  return { amount: cents, currencyCode: "hkd" }
}

function optionAddress(value: unknown): CheckoutAddress | null {
  const source = record(value)
  const address1 = source.address_1
  const city = source.city
  const countryCode = source.country_code
  if (typeof address1 !== "string" || typeof city !== "string" || countryCode !== "hk") return null
  return { address1, address2: typeof source.address_2 === "string" ? source.address_2 : null, city, postalCode: typeof source.postal_code === "string" ? source.postal_code : "00000", countryCode: "hk" }
}

function optionKind(source: Record<string, unknown>): "delivery" | "pickup" {
  const data = source.data && typeof source.data === "object" ? record(source.data) : {}
  const metadata = source.metadata && typeof source.metadata === "object" ? record(source.metadata) : {}
  const kind = data.fulfillment_kind ?? metadata.fulfillment_kind
  if (kind === "delivery" || kind === "pickup") return kind
  throw new CheckoutError("checkout_unavailable")
}

export function projectShippingOptions(values: unknown[], branches: BranchView[], locale: Locale): ShippingOptionView[] {
  return values.map((value) => {
    const source = record(value)
    const id = requiredString(source.id, "checkout_unavailable")
    const kind = optionKind(source)
    const data = source.data && typeof source.data === "object" ? record(source.data) : {}
    const metadata = source.metadata && typeof source.metadata === "object" ? record(source.metadata) : {}
    const branchHandle = kind === "pickup"
      ? requiredString(data.branch_handle ?? metadata.branch_handle, "checkout_unavailable")
      : null
    const branch = branchHandle ? branches.find((candidate) => candidate.handle === branchHandle && candidate.shippingOptionId === id) : null
    const type = source.type && typeof source.type === "object" ? record(source.type) : {}
    const rawAddress = record(source.service_zone ?? {}).fulfillment_set
    const location = rawAddress && typeof rawAddress === "object" ? record(rawAddress).location : null
    const address = location && typeof location === "object" ? optionAddress(record(location).address) : null
    const compatible = kind === "delivery"
      ? source.insufficient_inventory !== true
      : Boolean(branch?.compatible && address)
    const reasonCode = compatible ? null : branch?.reasonCode ?? (source.insufficient_inventory === true ? "inventory_conflict" : "incompatible_branch")
    const label = kind === "delivery"
      ? locale === "zh-HK" ? "香港送貨" : requiredString(type.label ?? source.name, "checkout_unavailable")
      : branch?.name ?? requiredString(type.label ?? source.name, "checkout_unavailable")
    return {
      id,
      kind,
      branchHandle,
      label,
      description: kind === "delivery" && locale === "zh-HK" ? "香港本地送貨" : requiredString(type.description ?? source.name, "checkout_unavailable"),
      price: projectMoney(source.amount ?? record(source.calculated_price ?? {}).calculated_amount),
      compatible,
      reasonCode,
      stagingLabel: branch?.stagingLabel ?? null,
      pickupAddress: kind === "pickup" ? address : null,
    }
  })
}

function hasAddress(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  const address = record(value)
  return address.country_code === "hk"
    && typeof address.address_1 === "string"
    && address.address_1.trim().length > 0
    && typeof address.city === "string"
    && address.city.trim().length > 0
}

function shippingMethods(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
}

function projectPayment(value: unknown): PaymentView {
  const collection = record(value, "payment_session_failed")
  const id = requiredString(collection.id, "payment_session_failed")
  const sessions = Array.isArray(collection.payment_sessions) ? collection.payment_sessions : []
  const session = sessions.find((item) => typeof item === "object" && item !== null && record(item).provider_id === SYSTEM_PAYMENT_PROVIDER_ID)
  if (!session) throw new CheckoutError("payment_session_failed")
  const source = record(session)
  return { id, providerId: SYSTEM_PAYMENT_PROVIDER_ID, status: requiredString(source.status, "payment_session_failed") }
}

function projectConfirmation(value: unknown, fulfillmentKind: "delivery" | "pickup", email: string): OrderConfirmationView {
  const source = record(value, "checkout_unavailable")
  if (typeof source.display_id !== "number" || !Number.isInteger(source.display_id)) throw new CheckoutError("checkout_unavailable")
  const currency = typeof source.currency_code === "string" ? source.currency_code.toLowerCase() : "hkd"
  if (currency !== "hkd") throw new CheckoutError("checkout_unavailable")
  return {
    orderId: requiredString(source.id, "checkout_unavailable"),
    displayId: source.display_id,
    email: requiredString(source.email ?? email, "checkout_unavailable"),
    total: projectMoney(source.total),
    fulfillmentKind,
    createdAt: requiredString(source.created_at, "checkout_unavailable"),
  }
}

export function createCheckoutSdk(sdk: Medusa): CheckoutSdk {
  return {
    store: {
      cart: {
        retrieve: (id, query) => sdk.store.cart.retrieve(id, query),
        update: (id, body, query) => sdk.store.cart.update(id, body as HttpTypes.StoreUpdateCart, query),
        addShippingMethod: (id, body, query) => sdk.store.cart.addShippingMethod(id, body as unknown as HttpTypes.StoreAddCartShippingMethods, query),
        complete: (id, query) => sdk.store.cart.complete(id, query),
      },
      fulfillment: {
        listCartOptions: (query) => sdk.store.fulfillment.listCartOptions(query as unknown as HttpTypes.StoreGetShippingOptionList),
      },
      payment: {
        listPaymentProviders: (query) => sdk.store.payment.listPaymentProviders(query as never),
        initiatePaymentSession: (cart, body, query) => sdk.store.payment.initiatePaymentSession(cart as HttpTypes.StoreCart, body as unknown as HttpTypes.StoreInitializePaymentSession, query),
      },
    },
  }
}

export function createCheckoutAdapter(sdk: CheckoutSdk) {
  async function retrieveRaw(cartId: string): Promise<MedusaCart & Record<string, unknown>> {
    const response = await sdk.store.cart.retrieve(cartId, { fields: checkoutFields })
    return record(response.cart, "checkout_unavailable") as MedusaCart & Record<string, unknown>
  }

  async function options(cartId: string, branches: BranchView[], locale: Locale): Promise<ShippingOptionView[]> {
    const response = await sdk.store.fulfillment.listCartOptions({ cart_id: cartId, fields: "id,name,amount,data,metadata,type,insufficient_inventory,service_zone.*" })
    return projectShippingOptions(response.shipping_options, branches, locale)
  }

  return {
    async getCheckout(cartId: string, locale: Locale, branches: BranchView[]): Promise<CheckoutView> {
      const cart = await retrieveRaw(cartId)
      const view = projectCart(cart)
      if (view.items.length === 0) throw new CheckoutError("empty_cart")
      const shippingOptions = await options(cartId, branches, locale)
      const method = shippingMethods(cart.shipping_methods)[0]
      const selected = method ? shippingOptions.find((option) => option.id === method.shipping_option_id) : undefined
      const providers = await sdk.store.payment.listPaymentProviders({ region_id: typeof cart.region_id === "string" ? cart.region_id : "", fields: "id,is_enabled" })
      const paymentProviderId = providers.payment_providers.some((provider) => record(provider).id === SYSTEM_PAYMENT_PROVIDER_ID)
        ? SYSTEM_PAYMENT_PROVIDER_ID
        : null
      return {
        cart: view,
        customer: null,
        fulfillment: selected?.branchHandle && selected.kind === "pickup"
          ? { kind: "pickup", shippingOptionId: selected.id, branchHandle: selected.branchHandle }
          : selected?.kind === "delivery"
            ? { kind: "delivery", shippingOptionId: selected.id }
            : null,
        stage: selected ? "review" : "contact",
        blockers: [],
        shippingOptions,
        paymentProviderId,
      }
    },

    async updateContact(cartId: string, input: ContactInput): Promise<CartView> {
      const body: Record<string, unknown> = {
        email: input.email,
        metadata: { fotomax_checkout_first_name: input.firstName, fotomax_checkout_last_name: input.lastName, fotomax_checkout_phone: input.phone },
      }
      if (input.address) {
        body.shipping_address = {
          first_name: input.firstName,
          last_name: input.lastName,
          address_1: input.address.address1,
          address_2: input.address.address2,
          city: input.address.city,
          postal_code: input.address.postalCode,
          country_code: input.address.countryCode,
          phone: input.phone,
        }
      }
      const response = await sdk.store.cart.update(cartId, body, { fields: checkoutFields })
      return projectCart(record(response.cart, "checkout_unavailable") as MedusaCart)
    },

    async setFulfillment(cartId: string, input: FulfillmentInput, shippingOptions: ShippingOptionView[]): Promise<{ cart: CartView; fulfillment: FulfillmentChoice }> {
      const option = shippingOptions.find((candidate) => candidate.id === input.shippingOptionId && candidate.kind === input.kind)
      if (!option || !option.compatible || (input.kind === "pickup" && option.branchHandle !== input.branchHandle)) {
        throw new CheckoutError(input.kind === "pickup" ? "incompatible_branch" : "shipping_unavailable")
      }
      const raw = await retrieveRaw(cartId)
      if (input.kind === "delivery" && !hasAddress(raw.shipping_address)) throw new CheckoutError("missing_delivery_address")
      if (input.kind === "pickup") {
        if (!option.pickupAddress) throw new CheckoutError("incompatible_branch")
        const updated = await sdk.store.cart.update(cartId, {
          shipping_address: {
            address_1: option.pickupAddress.address1,
            address_2: option.pickupAddress.address2,
            city: option.pickupAddress.city,
            postal_code: option.pickupAddress.postalCode,
            country_code: option.pickupAddress.countryCode,
          },
        }, { fields: checkoutFields })
        raw.shipping_address = record(updated.cart).shipping_address
      }
      const response = await sdk.store.cart.addShippingMethod(cartId, { option_id: option.id }, { fields: checkoutFields })
      return {
        cart: projectCart(record(response.cart, "checkout_unavailable") as MedusaCart),
        fulfillment: input.kind === "pickup"
          ? { kind: input.kind, shippingOptionId: option.id, branchHandle: option.branchHandle ?? input.branchHandle }
          : { kind: input.kind, shippingOptionId: option.id },
      }
    },

    async validate(cartId: string, locale: Locale, branches: BranchView[]): Promise<{ cart: CartView; fulfillment: FulfillmentChoice }> {
      const raw = await retrieveRaw(cartId)
      const cart = projectCart(raw)
      if (!cart.items.length) throw new CheckoutError("empty_cart")
      const shippingOptions = await options(cartId, branches, locale)
      const method = shippingMethods(raw.shipping_methods)[0]
      const option = method ? shippingOptions.find((candidate) => candidate.id === method.shipping_option_id) : undefined
      if (!option || !option.compatible) throw new CheckoutError(option?.reasonCode === "retail_out_of_stock" ? "inventory_conflict" : "shipping_unavailable")
      if (option.kind === "delivery") {
        if (!hasAddress(raw.shipping_address)) throw new CheckoutError("missing_delivery_address")
        return { cart, fulfillment: { kind: "delivery", shippingOptionId: option.id } }
      }
      if (!option.branchHandle) throw new CheckoutError("incompatible_branch")
      return { cart, fulfillment: { kind: "pickup", shippingOptionId: option.id, branchHandle: option.branchHandle } }
    },

    async initializePayment(cartId: string): Promise<PaymentView> {
      const raw = await retrieveRaw(cartId)
      const providers = await sdk.store.payment.listPaymentProviders({ region_id: typeof raw.region_id === "string" ? raw.region_id : "", fields: "id,is_enabled" })
      const provider = providers.payment_providers.find((candidate) => record(candidate).id === SYSTEM_PAYMENT_PROVIDER_ID)
      if (!provider) throw new CheckoutError("system_payment_unavailable")
      try {
        const response = await sdk.store.payment.initiatePaymentSession(raw, { provider_id: SYSTEM_PAYMENT_PROVIDER_ID }, { fields: "id,payment_sessions.id,payment_sessions.provider_id,payment_sessions.status" })
        return projectPayment(response.payment_collection)
      } catch (error) {
        if (error instanceof CheckoutError) throw error
        throw new CheckoutError("payment_session_failed")
      }
    },

    async complete(cartId: string, fulfillmentKind: "delivery" | "pickup", email: string): Promise<OrderConfirmationView> {
      const response = record(await sdk.store.cart.complete(cartId, { fields: orderFields }), "stale_checkout_total")
      if (response.type === "cart") throw new CheckoutError("stale_checkout_total")
      if (response.type !== "order") throw new CheckoutError("checkout_unavailable")
      return projectConfirmation(response.order, fulfillmentKind, email)
    },
  }
}

export type CheckoutAdapter = ReturnType<typeof createCheckoutAdapter>
