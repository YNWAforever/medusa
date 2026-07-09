import { describe, expect, it } from "vitest"
import { assertLocale, localeHref } from "./locales"

describe("storefront locale helpers", () => {
  it("accepts supported locale route segments", () => {
    expect(assertLocale("zh-HK")).toBe("zh-HK")
    expect(assertLocale("en")).toBe("en")
  })

  it("rejects unsupported locale route segments", () => {
    expect(() => assertLocale("zh")).toThrow("Unsupported locale: zh")
  })

  it("builds stable localized hrefs", () => {
    expect(localeHref("en", "/categories/photo-print")).toBe("/en/categories/photo-print")
    expect(localeHref("zh-HK", "products/classic-4r-photo-print")).toBe("/zh-HK/products/classic-4r-photo-print")
  })
})
