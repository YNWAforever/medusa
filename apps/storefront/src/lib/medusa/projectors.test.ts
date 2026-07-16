import { describe, expect, it } from "vitest"
import { projectCatalogCollection, projectCatalogProduct } from "./projectors"

const collection = {
  id: "pcol_photo_print",
  handle: "photo-print",
  title: "Photo Print",
  metadata: {
    title_zh_hk: "相片沖印",
    summary_en: "Fast prints for everyday moments.",
    summary_zh_hk: "為日常回憶提供快速沖印服務。",
  },
}

const product = {
  id: "prod_4r_print",
  handle: "classic-4r-photo-print",
  title: "Classic 4R Photo Print",
  description: "Standard-size prints for everyday sharing.",
  thumbnail: "https://example.test/4r.jpg",
  collection: { handle: "photo-print" },
  metadata: {
    title_zh_hk: "經典 4R 相片沖印",
    description_zh_hk: "適合日常分享的標準尺寸相片。",
    badge_en: "Popular service",
    badge_zh_hk: "人氣服務",
    commerce_mode: "photo_print",
  },
  variants: [
    {
      id: "variant_4r_glossy",
      title: "Glossy",
      sku: "FOTOMAX-4R-GLOSSY",
      manage_inventory: true,
      allow_backorder: false,
      inventory_quantity: 75,
      calculated_price: { calculated_amount: 78 },
      options: [
        {
          value: "Glossy",
          option: {
            title: "Paper finish",
            metadata: { title_zh_hk: "相紙表面" },
          },
        },
      ],
    },
  ],
}

describe("Medusa catalog projectors", () => {
  it("projects English collection and product metadata into stable DTOs", () => {
    const catalogProduct = projectCatalogProduct(product, "en")

    expect(projectCatalogCollection(collection, [catalogProduct], "en")).toEqual({
      id: "pcol_photo_print",
      handle: "photo-print",
      title: "Photo Print",
      summary: "Fast prints for everyday moments.",
      products: [
        {
          id: "prod_4r_print",
          handle: "classic-4r-photo-print",
          title: "Classic 4R Photo Print",
          description: "Standard-size prints for everyday sharing.",
          thumbnail: "https://example.test/4r.jpg",
          collectionHandle: "photo-print",
          badge: "Popular service",
          commerceMode: "photo_print",
          variants: [
            {
              id: "variant_4r_glossy",
              title: "Glossy",
              sku: "FOTOMAX-4R-GLOSSY",
              options: [{ name: "Paper finish", value: "Glossy" }],
              price: { amount: 7800, currencyCode: "hkd" },
              inventory: { managed: true, available: true, quantity: 75 },
            },
          ],
        },
      ],
    })
  })

  it("projects Traditional Chinese metadata and unmanaged inventory", () => {
    const catalogProduct = projectCatalogProduct(
      {
        ...product,
        variants: [{ ...product.variants[0], manage_inventory: false, inventory_quantity: 75 }],
      },
      "zh-HK",
    )

    expect(projectCatalogCollection(collection, [catalogProduct], "zh-HK")).toMatchObject({
      title: "相片沖印",
      summary: "為日常回憶提供快速沖印服務。",
      products: [
        {
          title: "經典 4R 相片沖印",
          description: "適合日常分享的標準尺寸相片。",
          badge: "人氣服務",
          variants: [
            {
              options: [{ name: "相紙表面", value: "Glossy" }],
              price: { amount: 7800, currencyCode: "hkd" },
              inventory: { managed: false, available: true, quantity: null },
            },
          ],
        },
      ],
    })
  })

  it("rejects an unknown commerce mode", () => {
    expect(() => projectCatalogProduct({ ...product, metadata: { ...product.metadata, commerce_mode: "rental" } }, "en"))
      .toThrow("Unknown commerce_mode: rental")
  })
  it.each([-1, Number.POSITIVE_INFINITY, Number.NaN])(
    "rejects an invalid calculated amount of %s",
    (calculatedAmount) => {
      expect(() => projectCatalogProduct(
        {
          ...product,
          variants: [{
            ...product.variants[0],
            calculated_price: { calculated_amount: calculatedAmount },
          }],
        },
        "en",
      )).toThrow("Medusa calculated_amount must be a non-negative number")
    },
  )

  it.each([0.001, 78.999])(
    "rejects a fractional-cent calculated amount of %s",
    (calculatedAmount) => {
      expect(() => projectCatalogProduct(
        {
          ...product,
          variants: [{
            ...product.variants[0],
            calculated_price: { calculated_amount: calculatedAmount },
          }],
        },
        "en",
      )).toThrow("Medusa calculated_amount must be a non-negative number")
    },
  )

  it("preserves a two-decimal calculated amount despite floating-point noise", () => {
    const catalogProduct = projectCatalogProduct(
      {
        ...product,
        variants: [{
          ...product.variants[0],
          calculated_price: { calculated_amount: 0.29 },
        }],
      },
      "en",
    )

    expect(catalogProduct.variants[0].price).toEqual({ amount: 29, currencyCode: "hkd" })
  })
  it("projects managed inventory as unavailable when out of stock and available when backorders are allowed", () => {
    const outOfStock = projectCatalogProduct(
      {
        ...product,
        variants: [{ ...product.variants[0], inventory_quantity: 0, allow_backorder: false }],
      },
      "en",
    )
    const backorderable = projectCatalogProduct(
      {
        ...product,
        variants: [{ ...product.variants[0], inventory_quantity: 0, allow_backorder: true }],
      },
      "en",
    )

    expect(outOfStock.variants[0].inventory).toEqual({ managed: true, available: false, quantity: 0 })
    expect(backorderable.variants[0].inventory).toEqual({ managed: true, available: true, quantity: 0 })
  })
})
