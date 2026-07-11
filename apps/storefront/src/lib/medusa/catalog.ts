import "server-only"
import type { CatalogCategory, Locale } from "./contracts"
import { createStoreSdk } from "./client"
import {
  projectCatalogCollection,
  projectCatalogProduct,
  type MedusaStoreCollection,
  type MedusaStoreProduct,
} from "./projectors"

const DEFAULT_PAGE_SIZE = 100
const REGION_FIELDS = "id,currency_code"
const COLLECTION_FIELDS = "id,handle,title,metadata"
const PRODUCT_FIELDS = [
  "id",
  "handle",
  "title",
  "description",
  "thumbnail",
  "metadata",
  "collection.handle",
  "variants.id",
  "variants.title",
  "variants.sku",
  "variants.manage_inventory",
  "variants.allow_backorder",
  "variants.inventory_quantity",
  "variants.calculated_price.*",
  "variants.options.value",
  "variants.options.option.title",
  "variants.options.option.metadata",
].join(",")

interface PaginatedResponse {
  count: number
  offset: number
  limit: number
}

interface MedusaStoreRegion {
  id: string
  currency_code: string
}

export interface StorefrontCatalogSdk {
  store: {
    region: {
      list: (query: { fields: string; limit: number; offset: number }) => Promise<PaginatedResponse & { regions: MedusaStoreRegion[] }>
    }
    collection: {
      list: (query: { fields: string; limit: number; offset: number }) => Promise<PaginatedResponse & { collections: MedusaStoreCollection[] }>
    }
    product: {
      list: (query: { fields: string; limit: number; offset: number; region_id: string }) => Promise<PaginatedResponse & { products: MedusaStoreProduct[] }>
    }
  }
}

async function listAll<T>(
  list: (offset: number) => Promise<{ count: number; items: T[] }>,
): Promise<T[]> {
  const records: T[] = []
  let offset = 0

  while (true) {
    const page = await list(offset)
    records.push(...page.items)

    if (records.length >= page.count) {
      return records
    }

    if (page.items.length === 0) {
      throw new Error("Medusa returned an incomplete paginated response")
    }

    offset += page.items.length
  }
}

async function findHongKongRegion(sdk: StorefrontCatalogSdk, pageSize: number): Promise<MedusaStoreRegion> {
  const regions = await listAll(async (offset) => {
    const response = await sdk.store.region.list({ fields: REGION_FIELDS, limit: pageSize, offset })
    return { count: response.count, items: response.regions }
  })
  const region = regions.find((candidate) => candidate.currency_code.toLowerCase() === "hkd")

  if (!region) {
    throw new Error("No HKD region is configured in Medusa")
  }

  return region
}

async function listCollections(sdk: StorefrontCatalogSdk, pageSize: number): Promise<MedusaStoreCollection[]> {
  return listAll(async (offset) => {
    const response = await sdk.store.collection.list({ fields: COLLECTION_FIELDS, limit: pageSize, offset })
    return { count: response.count, items: response.collections }
  })
}

async function listProducts(
  sdk: StorefrontCatalogSdk,
  regionId: string,
  pageSize: number,
): Promise<MedusaStoreProduct[]> {
  return listAll(async (offset) => {
    const response = await sdk.store.product.list({
      fields: PRODUCT_FIELDS,
      limit: pageSize,
      offset,
      region_id: regionId,
    })
    return { count: response.count, items: response.products }
  })
}

export async function getCatalogCategories(
  locale: Locale,
  suppliedSdk?: StorefrontCatalogSdk,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<CatalogCategory[]> {
  const sdk = suppliedSdk ?? (await createStoreSdk() as unknown as StorefrontCatalogSdk)
  const region = await findHongKongRegion(sdk, pageSize)
  const [collections, products] = await Promise.all([
    listCollections(sdk, pageSize),
    listProducts(sdk, region.id, pageSize),
  ])
  const projectedProducts = products.map((product) => projectCatalogProduct(product, locale))

  return collections.map((collection) => projectCatalogCollection(
    collection,
    projectedProducts.filter((product) => product.collectionHandle === collection.handle),
    locale,
  ))
}