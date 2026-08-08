import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("StorefrontLink", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal("__STOREFRONT_URL__", "https://shop.example.com/")
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders the configured Traditional Chinese storefront link", async () => {
    const { default: StorefrontLink } = await import("./storefront-link")
    const markup = renderToStaticMarkup(<StorefrontLink />)

    expect(markup).toContain('href="https://shop.example.com/zh-HK"')
    expect(markup).toContain('target="_blank"')
    expect(markup).toContain('rel="noopener noreferrer"')
    expect(markup).toContain("Open storefront")
    expect(markup).toContain('aria-hidden="true"')
  })

  it("renders no navigation when the build-time URL is absent", async () => {
    vi.resetModules()
    vi.stubGlobal("__STOREFRONT_URL__", undefined)

    const { default: StorefrontLink } = await import("./storefront-link")

    expect(renderToStaticMarkup(<StorefrontLink />)).toBe("")
  })
})
