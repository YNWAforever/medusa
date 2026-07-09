import { describe, expect, it } from "vitest"
import {
  categories,
  defaultLocale,
  formatPrice,
  getCategory,
  getProduct,
  getProductsByCategory,
  getServiceEntry,
  isLocale,
  locales,
  localize,
  products,
  serviceEntries,
  t,
} from "./index"

describe("Fotomax shared catalog", () => {
  it("defines the supported bilingual locales", () => {
    expect(defaultLocale).toBe("zh-HK")
    expect(locales).toEqual(["zh-HK", "en"])
    expect(isLocale("zh-HK")).toBe(true)
    expect(isLocale("en")).toBe(true)
    expect(isLocale("fr")).toBe(false)
  })

  it("keeps category and product handles unique", () => {
    expect(new Set(categories.map((category) => category.handle)).size).toBe(categories.length)
    expect(new Set(products.map((product) => product.handle)).size).toBe(products.length)
  })

  it("links every product to an existing category", () => {
    const handles = new Set(categories.map((category) => category.handle))
    for (const product of products) {
      expect(handles.has(product.categoryHandle)).toBe(true)
    }
  })

  it("returns bilingual category, product, and service data", () => {
    expect(localize(getCategory("photo-print")!.name, "en")).toBe("Photo Print")
    expect(localize(getProduct("classic-4r-photo-print")!.name, "zh-HK")).toBe("經典 4R 相片沖印")
    expect(localize(getServiceEntry("upload-photo-print")!.title, "en")).toBe("Upload Photo Print Order")
  })

  it("filters category products and formats Hong Kong prices", () => {
    expect(getProductsByCategory("photo-print").map((product) => product.handle)).toContain("classic-4r-photo-print")
    expect(formatPrice(280, "en")).toBe("HK$2.80")
    expect(formatPrice(280, "zh-HK")).toBe("HK$2.80")
  })

  it("uses product-representative audited media", () => {
    expect(getProduct("premium-layflat-photobook")!.image).toBe("https://images.unsplash.com/photo-1528569937393-ee892b976859?auto=format&fit=crop&w=1200&q=80")
    expect(getProduct("instax-mini-film-pack")!.image).toBe("https://images.unsplash.com/photo-1486574655068-162e94137442?auto=format&fit=crop&w=1200&q=80")
    expect(getProduct("desktop-acrylic-photo-block")!.image).toBe("https://images.unsplash.com/photo-1526049471490-b2a136bb4538?auto=format&fit=crop&w=1200&q=80")
  })

  it("provides shared navigation copy", () => {
    expect(t("en", "cart")).toBe("Cart")
    expect(t("zh-HK", "cart")).toBe("購物車")
  })

  it("has polished next-phase service entries", () => {
    expect(serviceEntries.every((entry) => entry.status === "next-phase")).toBe(true)
    expect(serviceEntries.map((entry) => entry.handle)).toContain("upload-photo-print")
    expect(serviceEntries.map((entry) => entry.handle)).toContain("store-pickup")
  })
})
