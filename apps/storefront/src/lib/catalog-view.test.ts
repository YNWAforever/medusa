import { describe, expect, it } from "vitest"
import { products } from "@fotomax/shared"
import {
  buildCategoryFilterHref,
  filterProducts,
  getCategoryView,
  getProductView,
  parseProductFilter,
} from "./catalog-view"

describe("catalog view selectors", () => {
  it("returns a category with its products", () => {
    const view = getCategoryView("photo-print")

    expect(view?.category.handle).toBe("photo-print")
    expect(view?.products.map((product) => product.handle)).toContain("classic-4r-photo-print")
  })

  it("returns undefined for unknown categories", () => {
    expect(getCategoryView("unknown")).toBeUndefined()
  })

  it("returns a product with its parent category", () => {
    const view = getProductView("classic-4r-photo-print")

    expect(view?.product.handle).toBe("classic-4r-photo-print")
    expect(view?.category.handle).toBe("photo-print")
  })

  it("returns undefined for unknown products", () => {
    expect(getProductView("unknown")).toBeUndefined()
  })

  it("filters products by customer-facing availability state", () => {
    const featured = filterProducts(products, "featured")
    const available = filterProducts(products, "available")

    expect(filterProducts(products, "all")).toHaveLength(products.length)
    expect(featured).toHaveLength(2)
    expect(featured.every((product) => product.status === "featured")).toBe(true)
    expect(available).toHaveLength(3)
    expect(available.every((product) => product.status === "available")).toBe(true)
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
