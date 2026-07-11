import { describe, expect, it } from "vitest"
import {
  categories,
  copy,
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

const bannedCustomerCopy = /next phase|下一階段|Medusa/i

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

  it("classifies products for their current commerce release", () => {
    expect(Object.fromEntries(products.map((product) => [product.handle, product.commerceMode]))).toEqual({
      "classic-4r-photo-print": "photo_print",
      "premium-layflat-photobook": "deferred",
      "photo-mug-gift": "deferred",
      "instax-mini-film-pack": "retail",
      "desktop-acrylic-photo-block": "deferred",
    })
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

  it("keeps every localized service field customer-facing", () => {
    for (const entry of serviceEntries) {
      const shopperFacingFields = [
        ["title", entry.title],
        ["summary", entry.summary],
        ["actionLabel", entry.actionLabel],
      ] as const

      for (const [fieldName, field] of shopperFacingFields) {
        for (const locale of locales) {
          expect(field[locale], `${entry.handle}.${fieldName}.${locale}`).not.toMatch(bannedCustomerCopy)
        }
      }
    }
  })

  it("uses customer-facing coming-soon copy", () => {
    expect(copy).toHaveProperty("comingSoon")
    expect(copy).not.toHaveProperty("nextPhase")
    expect(t("en", "comingSoon")).toBe("Coming soon")
    expect(t("zh-HK", "comingSoon")).toBe("即將推出")

    for (const locale of locales) {
      expect(t(locale, "comingSoon")).not.toMatch(bannedCustomerCopy)
    }
  })

  it("has polished next-phase service entries", () => {
    expect(serviceEntries.every((entry) => entry.status === "next-phase")).toBe(true)
    expect(serviceEntries.map((entry) => entry.handle)).toContain("upload-photo-print")
    expect(serviceEntries.map((entry) => entry.handle)).toContain("store-pickup")
  })
})
