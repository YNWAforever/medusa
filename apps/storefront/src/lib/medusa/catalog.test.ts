import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("./client", () => ({ createStoreSdk: vi.fn() }))
import { getCatalogCategories, type StorefrontCatalogSdk } from "./catalog"

const collections = [
  {
    id: "pcol_photo_print",
    handle: "photo-print",
    title: "Photo Print",
    metadata: { summary_en: "Prints", summary_zh_hk: "沖印", title_zh_hk: "相片沖印" },
  },
  {
    id: "pcol_film",
    handle: "instax-film",
    title: "Instax & Film",
    metadata: { summary_en: "Film", summary_zh_hk: "菲林", title_zh_hk: "Instax 菲林" },
  },
]

function product(id: string, collectionHandle: string) {
  return {
    id,
    handle: id,
    title: id,
    description: `${id} description`,
    thumbnail: null,
    collection: { handle: collectionHandle },
    metadata: { commerce_mode: "retail", badge_en: "New", badge_zh_hk: "新品" },
    variants: [
      {
        id: `${id}_variant`,
        title: "Default",
        sku: `${id}-SKU`,
        manage_inventory: true,
        allow_backorder: false,
        inventory_quantity: 75,
        calculated_price: { calculated_amount: 78 },
        options: [],
      },
    ],
  }
}

function createSdk(): StorefrontCatalogSdk {
  return {
    store: {
      region: {
        list: vi.fn(async () => ({ regions: [{ id: "reg_hk", currency_code: "hkd" }], count: 1, offset: 0, limit: 100 })),
      },
      collection: {
        list: vi.fn(async ({ offset }) => ({
          collections: offset === 0 ? [collections[0]] : [collections[1]],
          count: 2,
          offset,
          limit: 1,
        })),
      },
      product: {
        list: vi.fn(async ({ offset }) => ({
          products: offset === 0 ? [product("prod_print", "photo-print")] : [product("prod_film", "instax-film")],
          count: 2,
          offset,
          limit: 1,
        })),
      },
    },
  }
}

describe("live Medusa catalog access", () => {
  it("discovers the HK region, paginates catalog responses, and projects HKD cents", async () => {
    const sdk = createSdk()

    await expect(getCatalogCategories("en", sdk, 1)).resolves.toEqual([
      expect.objectContaining({ handle: "photo-print", products: [expect.objectContaining({ handle: "prod_print" })] }),
      expect.objectContaining({ handle: "instax-film", products: [expect.objectContaining({ handle: "prod_film" })] }),
    ])

    expect(sdk.store.collection.list).toHaveBeenNthCalledWith(1, expect.objectContaining({ offset: 0, limit: 1 }))
    expect(sdk.store.collection.list).toHaveBeenNthCalledWith(2, expect.objectContaining({ offset: 1, limit: 1 }))
    expect(sdk.store.product.list).toHaveBeenNthCalledWith(1, expect.objectContaining({ region_id: "reg_hk", offset: 0, limit: 1, fields: expect.stringMatching(/variants\.inventory_quantity.*variants\.calculated_price\.\*/) }))
    expect(sdk.store.product.list).toHaveBeenNthCalledWith(2, expect.objectContaining({ region_id: "reg_hk", offset: 1, limit: 1 }))
  })

  it("propagates Medusa network errors without fixture fallback", async () => {
    const sdk = createSdk()
    sdk.store.product.list = async () => {
      throw new Error("Medusa unavailable")
    }

    await expect(getCatalogCategories("en", sdk, 1)).rejects.toThrow("Medusa unavailable")
  })
})
