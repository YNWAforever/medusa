import { readFileSync } from "node:fs"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { BranchView } from "../lib/medusa/branches"
import type { CatalogProduct } from "../lib/medusa/contracts"
import { CartProvider } from "./cart-provider"
import { BranchAvailability, ProductPurchasePanel, isOptionValueAvailable, selectVariantForOption, startPhotoPrintJob } from "./product-purchase-panel"

const retailProduct: CatalogProduct = {
  id: "prod_film", handle: "instax-mini-film-pack", title: "Instax Mini Film Pack",
  description: "Instant film.", thumbnail: null, collectionHandle: "instax-film",
  badge: "Store pickup", commerceMode: "retail",
  variants: [
    { id: "variant_10", title: "10 shots", sku: "FILM-10", options: [{ name: "Pack", value: "10 shots" }], price: { amount: 7800, currencyCode: "hkd" }, inventory: { managed: true, available: true, quantity: 12 } },
    { id: "variant_20", title: "20 shots", sku: "FILM-20", options: [{ name: "Pack", value: "20 shots" }], price: { amount: 14800, currencyCode: "hkd" }, inventory: { managed: true, available: false, quantity: 0 } },
  ],
}

const branches: BranchView[] = [{
  id: "branch_central", handle: "central-staging", name: "Central Staging Pickup",
  district: "Central", leadTimeBusinessDays: 2, compatible: true, reasonCode: null,
  shippingOptionId: "so_central", stagingLabel: "Staging test data",
}]

describe("retail product purchase panel", () => {
  it("selects the exact variant for a native option change", () => {
    expect(selectVariantForOption(retailProduct, "variant_10", "Pack", "20 shots"))
      .toMatchObject({ id: "variant_20", inventory: { available: false } })
  })

  it("renders keyboard-native variant selection, live price, and one guarded add command", () => {
    const markup = renderToStaticMarkup(
      <CartProvider><ProductPurchasePanel product={retailProduct} locale="en" photoPrintEnabled={false} /></CartProvider>,
    )
    const source = readFileSync(new URL("./add-to-cart-button.tsx", import.meta.url), "utf8")
    expect(markup).toContain('<label for="purchase-option-pack-1">Pack</label>')
    expect(markup).toContain('<select id="purchase-option-pack-1"')
    expect(markup).toContain("10 shots")
    expect(markup).toContain("20 shots")
    expect(markup).toContain("HK$78.00")
    expect(markup).toContain('type="button"')
    expect(source.match(/addVariant\(variant\.id, 1\)/g)).toHaveLength(1)
  })

  it("preserves other selections and disables impossible option combinations", () => {
    const product: CatalogProduct = {
      ...retailProduct,
      variants: [
        { ...retailProduct.variants[0], id: "red-small", options: [{ name: "Color", value: "Red" }, { name: "Size", value: "Small" }] },
        { ...retailProduct.variants[0], id: "blue-large", options: [{ name: "Color", value: "Blue" }, { name: "Size", value: "Large" }] },
      ],
    }
    expect(selectVariantForOption(product, "red-small", "Size", "Large").id).toBe("red-small")
    expect(isOptionValueAvailable(product, "red-small", "Size", "Large")).toBe(false)
  })

  it("generates unique label targets for multiple zh-HK option names", () => {
    const product: CatalogProduct = {
      ...retailProduct,
      variants: [{ ...retailProduct.variants[0], options: [{ name: "顏色", value: "紅色" }, { name: "尺寸", value: "細" }] }],
    }
    const markup = renderToStaticMarkup(<ProductPurchasePanel product={product} locale="zh-HK" photoPrintEnabled={false} />)
    expect(markup).toContain('for="purchase-option-option-1"')
    expect(markup).toContain('for="purchase-option-option-2"')
  })

  it("refetches branches for cart content changes and recovers an expired branch cart", () => {
    const source = readFileSync(new URL("./product-purchase-panel.tsx", import.meta.url), "utf8")
    expect(source).toContain("cartSignature")
    expect(source).toContain("response.status === 410")
    expect(source).toContain("refreshCart")
  })

  it("disables an unavailable selected variant without silently choosing another", () => {
    const markup = renderToStaticMarkup(
      <CartProvider><ProductPurchasePanel product={retailProduct} locale="en" photoPrintEnabled={false} initialVariantId="variant_20" /></CartProvider>,
    )
    expect(markup).toContain("Out of stock")
    expect(markup).toContain("disabled")
  })

  it.each([
    ["en", "Photo print ordering is not available yet.", "Start photo print"],
    ["zh-HK", "相片沖印網上落單暫未開放。", "開始相片沖印"],
  ] as const)("gates photo-print editor entry honestly in %s", (locale, unavailable, action) => {
    const photoProduct: CatalogProduct = { ...retailProduct, commerceMode: "photo_print" }
    const disabled = renderToStaticMarkup(<ProductPurchasePanel product={photoProduct} locale={locale} photoPrintEnabled={false} />)
    const enabled = renderToStaticMarkup(<ProductPurchasePanel product={photoProduct} locale={locale} photoPrintEnabled />)
    expect(disabled).toContain(unavailable)
    expect(disabled).not.toContain("/photo-print/editor")
    expect(enabled).toContain(action)
    expect(enabled).toContain('type="button"')
    expect(enabled).not.toContain("/photo-print/editor")
    expect(enabled).not.toContain("addVariant")
  })

  it("creates a photo job before navigating to its localized URL", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      photo_job: { id: "phjob_123", locale: "zh-HK", status: "draft", revision: 0 },
    }), { status: 201, headers: { "content-type": "application/json" } }))
    const navigate = vi.fn()

    await startPhotoPrintJob("zh-HK", fetcher as typeof fetch, navigate)

    expect(fetcher).toHaveBeenCalledWith("/api/photo-jobs", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ locale: "zh-HK" }),
    }))
    expect(navigate).toHaveBeenCalledWith("/zh-HK/photo-jobs/phjob_123")
  })

  it("renders localized staging pickup availability, loading, and recovery states", () => {
    const available = renderToStaticMarkup(<BranchAvailability locale="en" state={{ status: "ready", branches }} />)
    const loading = renderToStaticMarkup(<BranchAvailability locale="en" state={{ status: "loading" }} />)
    const failed = renderToStaticMarkup(<BranchAvailability locale="zh-HK" state={{ status: "error" }} />)
    expect(available).toContain("Central Staging Pickup")
    expect(available).toContain("Staging test data")
    expect(available).toContain("Available for this cart")
    expect(loading).toContain("Checking staging pickup availability")
    expect(failed).toContain("暫時未能載入測試取貨資料，請稍後再試。")
  })
})
