import "server-only"
import type Medusa from "@medusajs/js-sdk"
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

type StoreRegionListQuery = NonNullable<Parameters<Medusa["store"]["region"]["list"]>[0]>
type StoreCollectionListQuery = NonNullable<Parameters<Medusa["store"]["collection"]["list"]>[0]>
type StoreProductListQuery = NonNullable<Parameters<Medusa["store"]["product"]["list"]>[0]>
type SdkStoreRegion = Awaited<ReturnType<Medusa["store"]["region"]["list"]>>["regions"][number]
type SdkStoreCollection = Awaited<ReturnType<Medusa["store"]["collection"]["list"]>>["collections"][number]
type SdkStoreProduct = Awaited<ReturnType<Medusa["store"]["product"]["list"]>>["products"][number]
type SdkStoreProductVariant = NonNullable<SdkStoreProduct["variants"]>[number]

interface CatalogPage<T> {
  count: number
  items: T[]
}

interface MedusaStoreRegion {
  id: string
  currency_code: string
}

export interface StorefrontCatalogSdk {
  listRegions: (query: StoreRegionListQuery) => Promise<CatalogPage<MedusaStoreRegion>>
  listCollections: (query: StoreCollectionListQuery) => Promise<CatalogPage<MedusaStoreCollection>>
  listProducts: (query: StoreProductListQuery) => Promise<CatalogPage<MedusaStoreProduct>>
}

function normalizeMetadata(metadata: object | null | undefined): Record<string, unknown> | null | undefined {
  if (metadata === null || metadata === undefined) {
    return metadata
  }

  return Object.fromEntries(Object.entries(metadata))
}

function projectStoreRegion(region: SdkStoreRegion): MedusaStoreRegion {
  return {
    id: region.id,
    currency_code: region.currency_code,
  }
}

function projectStoreCollection(collection: SdkStoreCollection): MedusaStoreCollection {
  return {
    id: collection.id,
    handle: collection.handle,
    title: collection.title,
    metadata: normalizeMetadata(collection.metadata),
  }
}

function projectStoreProduct(product: SdkStoreProduct): MedusaStoreProduct {
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    description: product.description,
    thumbnail: product.thumbnail,
    collection: product.collection
      ? { handle: product.collection.handle }
      : product.collection,
    metadata: normalizeMetadata(product.metadata),
    variants: product.variants?.map((variant: SdkStoreProductVariant) => ({
      id: variant.id,
      title: variant.title ?? "",
      sku: variant.sku,
      manage_inventory: variant.manage_inventory,
      allow_backorder: variant.allow_backorder,
      inventory_quantity: variant.inventory_quantity,
      calculated_price: variant.calculated_price
        ? { calculated_amount: variant.calculated_price.calculated_amount }
        : variant.calculated_price,
      options: variant.options?.map((option) => ({
        value: option.value,
        option: option.option
          ? {
              title: option.option.title,
              metadata: normalizeMetadata(option.option.metadata),
            }
          : option.option,
      })),
    })),
  }
}

export function createStorefrontCatalogSdk(sdk: Medusa): StorefrontCatalogSdk {
  return {
    async listRegions(query) {
      const response = await sdk.store.region.list(query)

      return {
        count: response.count,
        items: response.regions.map(projectStoreRegion),
      }
    },
    async listCollections(query) {
      const response = await sdk.store.collection.list(query)

      return {
        count: response.count,
        items: response.collections.map(projectStoreCollection),
      }
    },
    async listProducts(query) {
      const response = await sdk.store.product.list(query)

      return {
        count: response.count,
        items: response.products.map(projectStoreProduct),
      }
    },
  }
}

async function listAll<T>(
  list: (offset: number) => Promise<CatalogPage<T>>,
): Promise<T[]> {
  const records: T[] = []
  let offset = 0

  while (true) {
    const page = await list(offset)
    records.push(...page.items)

    if (records.length > page.count) {
      throw new Error("Medusa returned more records than its reported count")
    }

    if (records.length === page.count) {
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
    return sdk.listRegions({ fields: REGION_FIELDS, limit: pageSize, offset })
  })
  const region = regions.find((candidate) => candidate.currency_code.toLowerCase() === "hkd")

  if (!region) {
    throw new Error("No HKD region is configured in Medusa")
  }

  return region
}

async function listCollections(sdk: StorefrontCatalogSdk, pageSize: number): Promise<MedusaStoreCollection[]> {
  return listAll((offset) => sdk.listCollections({
    fields: COLLECTION_FIELDS,
    limit: pageSize,
    offset,
  }))
}

async function listProducts(
  sdk: StorefrontCatalogSdk,
  regionId: string,
  pageSize: number,
): Promise<MedusaStoreProduct[]> {
  return listAll((offset) => sdk.listProducts({
    fields: PRODUCT_FIELDS,
    limit: pageSize,
    offset,
    region_id: regionId,
  }))
}

export async function getCatalogCategories(
  locale: Locale,
  suppliedSdk?: StorefrontCatalogSdk,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<CatalogCategory[]> {
  const sdk = suppliedSdk ?? createStorefrontCatalogSdk(await createStoreSdk())
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