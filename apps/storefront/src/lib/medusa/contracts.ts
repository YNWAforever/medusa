export type Locale = "en" | "zh-HK"
export type MoneyView = { amount: number; currencyCode: "hkd" }
export type CommerceMode = "retail" | "photo_print" | "deferred"

export interface CatalogVariant {
  id: string
  title: string
  sku: string
  options: Array<{ name: string; value: string }>
  price: MoneyView
  inventory: { managed: boolean; available: boolean; quantity: number | null }
}

export interface CatalogProduct {
  id: string
  handle: string
  title: string
  description: string
  thumbnail: string | null
  collectionHandle: string | null
  badge: string | null
  commerceMode: CommerceMode
  variants: CatalogVariant[]
}

export interface CatalogCategory {
  id: string
  handle: string
  title: string
  summary: string
  products: CatalogProduct[]
}

export interface CartLineView {
  id: string
  kind: "retail" | "photo_print"
  variantId: string
  title: string
  thumbnail: string | null
  quantity: number
  unitPrice: MoneyView
  subtotal: MoneyView
  photoJobVersionId: string | null
  photoCount: number | null
}

export interface CartView {
  id: string | null
  currencyCode: "hkd"
  items: CartLineView[]
  itemCount: number
  subtotal: MoneyView
  shippingTotal: MoneyView
  taxTotal: MoneyView
  total: MoneyView
  email: string | null
}

export interface CustomerView {
  id: string
  email: string
  firstName: string
  lastName: string
}

export type FulfillmentChoice =
  | { kind: "delivery"; shippingOptionId: string }
  | { kind: "pickup"; shippingOptionId: string; branchHandle: string }

export interface CheckoutState {
  cart: CartView
  customer: CustomerView | null
  fulfillment: FulfillmentChoice | null
  stage: "contact" | "fulfillment" | "review" | "payment" | "complete"
  blockers: Array<{ code: string; message: string; recoveryHref: string }>
}