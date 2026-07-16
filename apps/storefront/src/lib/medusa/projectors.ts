import type {
  CatalogCategory,
  CatalogProduct,
  CatalogVariant,
  CommerceMode,
  Locale,
  MoneyView,
} from "./contracts"

type Metadata = Record<string, unknown> | null | undefined

export interface MedusaStoreCollection {
  id: string
  handle: string
  title: string
  metadata?: Metadata
}

export interface MedusaStoreProduct {
  id: string
  handle: string
  title: string
  description?: string | null
  thumbnail?: string | null
  collection?: { handle?: string | null } | null
  metadata?: Metadata
  variants?: MedusaStoreVariant[] | null
}

export interface MedusaStoreVariant {
  id: string
  title: string
  sku?: string | null
  manage_inventory?: boolean | null
  allow_backorder?: boolean | null
  inventory_quantity?: number | null
  calculated_price?: { calculated_amount?: number | null } | null
  options?: MedusaStoreVariantOption[] | null
}

export interface MedusaStoreVariantOption {
  value: string
  option?: { title?: string | null; metadata?: Metadata } | null
}

function metadataString(metadata: Metadata, key: string): string | undefined {
  const value = metadata?.[key]
  return typeof value === "string" && value.trim() ? value : undefined
}

function localize(metadata: Metadata, key: string, fallback: string, locale: Locale): string {
  return locale === "zh-HK" ? metadataString(metadata, key) ?? fallback : fallback
}

function readCommerceMode(metadata: Metadata): CommerceMode {
  const commerceMode = metadataString(metadata, "commerce_mode")

  if (commerceMode === "retail" || commerceMode === "photo_print" || commerceMode === "deferred") {
    return commerceMode
  }

  throw new Error(`Unknown commerce_mode: ${commerceMode ?? "missing"}`)
}

function projectMoney(amount: number | null | undefined): MoneyView {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    throw new Error("Medusa calculated_amount must be a non-negative number")
  }

  const scaledCents = amount * 100
  const roundedCents = Math.round(scaledCents)
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaledCents)) * 4

  if (!Number.isSafeInteger(roundedCents) || Math.abs(scaledCents - roundedCents) > tolerance) {
    throw new Error("Medusa calculated_amount must be a non-negative number")
  }

  return { amount: roundedCents, currencyCode: "hkd" }
}

function projectVariant(variant: MedusaStoreVariant, locale: Locale): CatalogVariant {
  const managed = variant.manage_inventory === true
  const quantity = managed ? variant.inventory_quantity ?? 0 : null

  return {
    id: variant.id,
    title: variant.title,
    sku: variant.sku ?? "",
    options: (variant.options ?? []).map((option) => ({
      name: localize(option.option?.metadata, "title_zh_hk", option.option?.title ?? "", locale),
      value: option.value,
    })),
    price: projectMoney(variant.calculated_price?.calculated_amount),
    inventory: {
      managed,
      available: !managed || variant.allow_backorder === true || (quantity !== null && quantity > 0),
      quantity,
    },
  }
}

export function projectCatalogProduct(product: MedusaStoreProduct, locale: Locale): CatalogProduct {
  const metadata = product.metadata
  const badgeKey = locale === "zh-HK" ? "badge_zh_hk" : "badge_en"

  return {
    id: product.id,
    handle: product.handle,
    title: localize(metadata, "title_zh_hk", product.title, locale),
    description: localize(metadata, "description_zh_hk", product.description ?? "", locale),
    thumbnail: product.thumbnail ?? null,
    collectionHandle: product.collection?.handle ?? null,
    badge: metadataString(metadata, badgeKey) ?? (locale === "zh-HK" ? metadataString(metadata, "badge_en") ?? null : null),
    commerceMode: readCommerceMode(metadata),
    variants: (product.variants ?? []).map((variant) => projectVariant(variant, locale)),
  }
}

export function projectCatalogCollection(
  collection: MedusaStoreCollection,
  products: CatalogProduct[],
  locale: Locale,
): CatalogCategory {
  const metadata = collection.metadata

  return {
    id: collection.id,
    handle: collection.handle,
    title: localize(metadata, "title_zh_hk", collection.title, locale),
    summary: locale === "zh-HK"
      ? metadataString(metadata, "summary_zh_hk") ?? metadataString(metadata, "summary_en") ?? ""
      : metadataString(metadata, "summary_en") ?? "",
    products,
  }
}