import { describe, expect, it } from "vitest"

import {
  defaultStorefrontLocalePath,
  storefrontHomeHref,
} from "./storefront-url"

describe("storefrontHomeHref", () => {
  it("uses the default Traditional Chinese storefront locale", () => {
    expect(defaultStorefrontLocalePath).toBe("/zh-HK")
    expect(storefrontHomeHref("https://shop.example.com")).toBe(
      "https://shop.example.com/zh-HK",
    )
  })

  it("removes trailing slashes before appending the locale", () => {
    expect(storefrontHomeHref("https://shop.example.com///")).toBe(
      "https://shop.example.com/zh-HK",
    )
  })

  it("rejects a blank storefront URL", () => {
    expect(() => storefrontHomeHref("   ")).toThrow(
      "Storefront URL must not be empty",
    )
  })
})
