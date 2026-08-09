import "server-only"
import type Medusa from "@medusajs/js-sdk"
import type { CartLineView, CartView, MoneyView } from "./contracts"

type StoreCartApi = Pick<
  Medusa["store"]["cart"],
  "create" | "retrieve" | "createLineItem" | "updateLineItem" | "deleteLineItem"
>
type StoreRegionApi = Pick<Medusa["store"]["region"], "list">

export interface CartSdk {
  store: {
    cart: StoreCartApi
    region: StoreRegionApi
  }
}

export interface AddCartItemInput {
  variantId: string
  quantity: number
}

interface MedusaCartLine {
  id?: string
  variant_id?: string
  title?: string
  thumbnail?: string | null
  quantity: number
  unit_price?: number | null
  subtotal?: number | null
  metadata?: Record<string, unknown> | null
  variant?: {
    product?: {
      metadata?: Record<string, unknown> | null
    } | null
  } | null
}

export interface MedusaCart {
  id?: string
  currency_code?: string
  items?: MedusaCartLine[] | null
  subtotal?: number | null
  shipping_total?: number | null
  tax_total?: number | null
  total?: number | null
  email?: string | null
}

interface MedusaRegion {
  id: string
  currency_code: string
  countries?: Array<{ iso_2?: string | null }> | null
}

const cartFields = "id,currency_code,email,subtotal,shipping_total,tax_total,total,*items,*items.variant,*items.variant.product"

export type CartErrorCode =
  | "invalid_cart_input"
  | "cart_region_unavailable"
  | "cart_unrecoverable"

export class CartError extends Error {
  constructor(readonly code: CartErrorCode) {
    super(code)
  }
}

/**
 * A cart we cannot project cannot be rendered, so it cannot be repaired line by
 * line either. Callers respond by dropping the cart cookie so the shopper gets a
 * usable cart back instead of a permanent 502.
 */
export function isCartUnrecoverable(error: unknown): boolean {
  return error instanceof CartError && error.code === "cart_unrecoverable"
}

function projectMoney(value: number | null | undefined): MoneyView {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new CartError("cart_unrecoverable")
  }

  const cents = Math.round(value * 100)
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(value * 100)) * 4

  if (!Number.isSafeInteger(cents) || Math.abs(value * 100 - cents) > tolerance) {
    throw new CartError("cart_unrecoverable")
  }

  return { amount: cents, currencyCode: "hkd" }
}

function projectLine(line: MedusaCartLine): CartLineView {
  const mode = line.variant?.product?.metadata?.commerce_mode ?? line.metadata?.commerce_mode

  if (!line.id || !line.variant_id || !line.title || (mode !== "retail" && mode !== "photo_print")) {
    throw new CartError("cart_unrecoverable")
  }

  return {
    id: line.id,
    kind: mode,
    variantId: line.variant_id,
    title: line.title,
    thumbnail: line.thumbnail ?? null,
    quantity: line.quantity,
    unitPrice: projectMoney(line.unit_price),
    subtotal: projectMoney(line.subtotal),
    photoJobId: typeof line.metadata?.photo_job_id === "string"
      ? line.metadata.photo_job_id
      : null,
    photoJobVersionId: typeof line.metadata?.photo_job_version_id === "string"
      ? line.metadata.photo_job_version_id
      : null,
    photoCount: typeof line.metadata?.photo_item_count === "number"
      && Number.isInteger(line.metadata.photo_item_count)
      && line.metadata.photo_item_count >= 0
      ? line.metadata.photo_item_count
      : null,
  }
}

export function emptyCartView(): CartView {
  const zero = { amount: 0, currencyCode: "hkd" as const }

  return {
    id: null,
    currencyCode: "hkd",
    items: [],
    itemCount: 0,
    subtotal: zero,
    shippingTotal: zero,
    taxTotal: zero,
    total: zero,
    email: null,
  }
}

export function projectCart(cart: MedusaCart): CartView {
  if (cart.currency_code?.toLowerCase() !== "hkd" || !cart.id) {
    throw new CartError("cart_unrecoverable")
  }

  const items = (cart.items ?? []).map(projectLine)

  return {
    id: cart.id,
    currencyCode: "hkd",
    items,
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
    subtotal: projectMoney(cart.subtotal),
    shippingTotal: projectMoney(cart.shipping_total),
    taxTotal: projectMoney(cart.tax_total),
    total: projectMoney(cart.total),
    email: cart.email ?? null,
  }
}

function requireQuantity(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 99) {
    throw new CartError("invalid_cart_input")
  }

  return value
}

export function parseQuantityInput(value: unknown): number {
  return requireQuantity(value)
}

export function parseUpdateCartItemInput(value: unknown): number {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || Object.keys(value).length !== 1
    || !Object.hasOwn(value, "quantity")
  ) {
    throw new CartError("invalid_cart_input")
  }

  return requireQuantity(Reflect.get(value, "quantity"))
}

export function parseAddCartItemInput(value: unknown): AddCartItemInput {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || Object.keys(value).length !== 2
    || !Object.hasOwn(value, "variantId")
    || !Object.hasOwn(value, "quantity")
  ) {
    throw new CartError("invalid_cart_input")
  }

  const variantId = Reflect.get(value, "variantId")
  const quantity = Reflect.get(value, "quantity")

  if (typeof variantId !== "string" || !variantId.trim()) {
    throw new CartError("invalid_cart_input")
  }

  return { variantId, quantity: requireQuantity(quantity) }
}

export function createCartAdapter(sdk: CartSdk) {
  return {
    async retrieve(cartId: string): Promise<CartView> {
      const { cart } = await sdk.store.cart.retrieve(cartId, { fields: cartFields })
      return projectCart(cart)
    },

    async createWithLine(input: AddCartItemInput): Promise<CartView> {
      const response = await sdk.store.region.list({ fields: "id,currency_code,*countries" })
      const regions = response.regions as MedusaRegion[]
      const region = regions.find((candidate) =>
        candidate.currency_code.toLowerCase() === "hkd"
        && candidate.countries?.some((country) => country.iso_2?.toLowerCase() === "hk"),
      )

      if (!region) {
        throw new CartError("cart_region_unavailable")
      }

      const { cart } = await sdk.store.cart.create({ region_id: region.id }, { fields: cartFields })
      if (!cart.id) { throw new Error("Medusa did not return a cart id") }
      const result = await sdk.store.cart.createLineItem(
        cart.id,
        { variant_id: input.variantId, quantity: input.quantity },
        { fields: cartFields },
      )

      return projectCart(result.cart)
    },

    async addLine(cartId: string, input: AddCartItemInput): Promise<CartView> {
      const { cart } = await sdk.store.cart.createLineItem(
        cartId,
        { variant_id: input.variantId, quantity: input.quantity },
        { fields: cartFields },
      )
      return projectCart(cart)
    },

    async updateLine(cartId: string, lineId: string, quantity: number): Promise<CartView> {
      const { cart } = await sdk.store.cart.updateLineItem(
        cartId,
        lineId,
        { quantity },
        { fields: cartFields },
      )
      return projectCart(cart)
    },

    async removeLine(cartId: string, lineId: string): Promise<CartView> {
      const { parent } = await sdk.store.cart.deleteLineItem(cartId, lineId, { fields: cartFields })
      if (!parent) { throw new Error("Medusa did not return the updated cart") }
      return projectCart(parent)
    },
  }
}
