import { describe, expect, it } from "vitest"
import { products } from "@fotomax/shared"
import { filterProducts, getCategoryView, getProductView } from "./catalog-view"

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

  it("filters products by customer-facing availability state", () => {
    const featured = filterProducts(products, "featured")
    const available = filterProducts(products, "available")

    expect(filterProducts(products, "all")).toHaveLength(products.length)
    expect(featured).toHaveLength(2)
    expect(featured.every((product) => product.status === "featured")).toBe(true)
    expect(available).toHaveLength(3)
    expect(available.every((product) => product.status === "available")).toBe(true)
  })
})
