import { describe, expect, it, vi } from "vitest"
import type { CatalogCategory, CatalogProduct } from "./medusa/contracts"

vi.mock("server-only", () => ({}))
vi.mock("./medusa/catalog", () => ({ getCatalogCategories: vi.fn() }))
import {
  buildCategoryFilterHref,
  filterProducts,
  getCategoryView,
  getProductView,
  parseProductFilter,
} from "./catalog-filters"

const photoPrint: CatalogProduct = {
  id: "prod_photo_print",
  handle: "classic-4r-photo-print",
  title: "Classic 4R Photo Print",
  description: "Standard-size prints for everyday sharing.",
  thumbnail: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80",
  collectionHandle: "photo-print",
  badge: "Popular service",
  commerceMode: "photo_print",
  variants: [
    {
      id: "variant_glossy",
      title: "Glossy",
      sku: "PRINT-GLOSSY",
      options: [{ name: "Paper finish", value: "Glossy" }],
      price: { amount: 280, currencyCode: "hkd" },
      inventory: { managed: true, available: true, quantity: 12 },
    },
  ],
}

const featuredGift: CatalogProduct = {
  ...photoPrint,
  id: "prod_gift",
  handle: "photo-frame",
  title: "Photo Frame",
  collectionHandle: "personalized-gifts",
  badge: "Featured",
  commerceMode: "retail",
}

const deferredProduct: CatalogProduct = {
  ...photoPrint,
  id: "prod_deferred",
  handle: "premium-layflat-photobook",
  title: "Premium Layflat Photobook",
  collectionHandle: "photobook",
  badge: "Customizable",
  commerceMode: "deferred",
}

const categories: CatalogCategory[] = [
  {
    id: "pcol_photo_print",
    handle: "photo-print",
    title: "Photo Print",
    summary: "Fast prints and everyday photo services.",
    products: [photoPrint],
  },
  {
    id: "pcol_gifts",
    handle: "personalized-gifts",
    title: "Personalized Gifts",
    summary: "Personal keepsakes.",
    products: [featuredGift, deferredProduct],
  },
]

describe("catalog view selectors", () => {
  it("returns a live DTO category with its published products", () => {
    const view = getCategoryView(categories, "photo-print")

    expect(view?.category.handle).toBe("photo-print")
    expect(view?.products.map((product) => product.handle)).toEqual(["classic-4r-photo-print"])
  })

  it("returns undefined for an unknown live category", () => {
    expect(getCategoryView(categories, "unknown")).toBeUndefined()
  })

  it("returns a live DTO product with its parent category", () => {
    const view = getProductView(categories, "classic-4r-photo-print")

    expect(view?.product.handle).toBe("classic-4r-photo-print")
    expect(view?.category.handle).toBe("photo-print")
  })

  it("returns undefined for an unknown live product", () => {
    expect(getProductView(categories, "unknown")).toBeUndefined()
  })

  it("filters live DTOs by badge and purchasable inventory", () => {
    const unavailable = {
      ...featuredGift,
      id: "prod_unavailable",
      handle: "unavailable-frame",
      variants: [{ ...featuredGift.variants[0], inventory: { managed: true, available: false, quantity: 0 } }],
    }
    const source = [photoPrint, featuredGift, unavailable]

    expect(filterProducts(source, "featured").map((product) => product.handle)).toEqual([
      "classic-4r-photo-print",
      "photo-frame",
      "unavailable-frame",
    ])
    expect(filterProducts(source, "available").map((product) => product.handle)).toEqual([
      "classic-4r-photo-print",
      "photo-frame",
    ])
  })

  it("hides deferred products even when Medusa returns them", () => {
    expect(filterProducts([featuredGift, deferredProduct], "all").map((product) => product.handle)).toEqual([
      "photo-frame",
    ])
  })

  it("parses supported URL filters and falls back to all", () => {
    expect(parseProductFilter("all")).toBe("all")
    expect(parseProductFilter("featured")).toBe("featured")
    expect(parseProductFilter("available")).toBe("available")
    expect(parseProductFilter(undefined)).toBe("all")
    expect(parseProductFilter("next-phase")).toBe("all")
    expect(parseProductFilter(["featured"])).toBe("all")
  })

  it("builds shareable filter URLs while preserving other query parameters", () => {
    const pathname = "/en/categories/photo-print"

    expect(buildCategoryFilterHref(pathname, "sort=popular", "featured")).toBe(
      "/en/categories/photo-print?sort=popular&filter=featured",
    )
    expect(buildCategoryFilterHref(pathname, "filter=available&sort=popular", "all")).toBe(
      "/en/categories/photo-print?sort=popular",
    )
    expect(buildCategoryFilterHref(pathname, "", "all")).toBe(pathname)
  })
})