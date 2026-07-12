import { readFileSync } from "node:fs"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { BranchView } from "../lib/medusa/branches"
import type { CatalogProduct } from "../lib/medusa/contracts"
import { CartProvider } from "./cart-provider"
import { BranchAvailability, ProductPurchasePanel, selectVariantForOption } from "./product-purchase-panel"

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
    expect(markup).toContain('<label for="purchase-option-pack">Pack</label>')
    expect(markup).toContain('<select id="purchase-option-pack"')
    expect(markup).toContain("10 shots")
    expect(markup).toContain("20 shots")
    expect(markup).toContain("HK$78.00")
    expect(markup).toContain('type="button"')
    expect(source.match(/addVariant\(variant\.id, 1\)/g)).toHaveLength(1)
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
    expect(enabled).toContain(`href="/${locale}/services/photo-print/editor"`)
    expect(enabled).not.toContain("addVariant")
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
