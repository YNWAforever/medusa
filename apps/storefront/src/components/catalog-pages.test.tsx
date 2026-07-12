import { readFileSync } from "node:fs"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { CatalogCategory, CatalogProduct, Locale } from "../lib/medusa/contracts"
import type { ProductFilter } from "../lib/catalog-filters"
import { CategoryPage } from "./category-page"
import { ProductDetail } from "./product-detail"

vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), usePathname: () => "/en/categories/photo-print", useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }))

const product: CatalogProduct = { id: "prod_print", handle: "classic-4r-photo-print", title: "Classic 4R Photo Print", description: "Standard-size prints for family, travel, and everyday sharing.", thumbnail: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80", collectionHandle: "photo-print", badge: "Popular service", commerceMode: "retail", variants: [{ id: "variant_glossy", title: "Glossy", sku: "PRINT-GLOSSY", options: [{ name: "Paper finish", value: "Glossy" }, { name: "Paper finish", value: "Matte" }], price: { amount: 280, currencyCode: "hkd" }, inventory: { managed: true, available: true, quantity: 12 } }] }
const category: CatalogCategory = { id: "pcol_photo_print", handle: "photo-print", title: "Photo Print", summary: "Fast prints, ID photos, and everyday photo services.", products: [product] }
function renderCatalog(locale: Locale, initialFilter: ProductFilter = "all") { return { category: renderToStaticMarkup(<CategoryPage category={category} products={category.products} locale={locale} initialFilter={initialFilter} />), product: renderToStaticMarkup(<ProductDetail product={product} category={category} locale={locale} />) } }

describe("Fotomax catalog page composition", () => {
  it.each([["en", "Products"], ["zh-HK", "產品"]] as const)("renders a clear localized heading hierarchy from DTOs in %s", (locale, productsHeading) => { const markup = renderCatalog(locale); expect(markup.category.match(/<h1>/g)).toHaveLength(1); expect(markup.category).toContain(`<h1>${category.title}</h1>`); expect(markup.category).toContain(`<h2>${productsHeading}</h2>`); expect(markup.product).toContain(`<h1>${product.title}</h1>`) })
  it.each(["en", "zh-HK"] as const)("renders complete live catalog destinations in %s", (locale) => { const markup = renderCatalog(locale); expect(markup.category).toContain('<main id="main-content">'); expect(markup.product).toContain('id="main-content"'); expect(markup.product).toContain(`href="/${locale}/categories/${category.handle}"`); expect(markup.category).toContain(`href="/${locale}/products/${product.handle}"`); expect(markup.category).toContain('href="/' + locale + '/services/store-pickup"') })
  it("renders variants as purchase options and uses the live price", () => { const markup = renderCatalog("en").product; expect(markup).toContain("Paper finish"); expect(markup).toContain("Glossy"); expect(markup).toContain("Matte"); expect(markup).toContain("HK$"); expect(markup).toContain('class="product-purchase-panel"'); expect(markup).toContain("<select") })
  it("uses optimized imagery and gracefully renders a product without a thumbnail", () => { const markup = renderCatalog("en"); expect(markup.category).toMatch(/<img alt=""[^>]*class="category-hero-image"[^>]*sizes="100vw"/); expect(markup.product).toMatch(/<img alt="Classic 4R Photo Print"[^>]*class="product-detail-image"/); const noImage = renderToStaticMarkup(<ProductDetail product={{ ...product, thumbnail: null }} category={category} locale="en" />); expect(noImage).toContain('class="product-image-placeholder"') })
  it("renders localized zh-HK DTO copy and stock state without English fallback", () => {
    const zhProduct: CatalogProduct = {
      ...product,
      title: "經典 4R 相片沖印",
      description: "適合日常分享的標準尺寸相片。",
      variants: product.variants.map((variant) => ({
        ...variant,
        inventory: { managed: true, available: false, quantity: 0 },
      })),
    }
    const zhCategory: CatalogCategory = {
      ...category,
      title: "相片沖印",
      summary: "快速沖印及日常影像服務。",
      products: [zhProduct],
    }
    const markup = renderToStaticMarkup(
      <ProductDetail product={zhProduct} category={zhCategory} locale="zh-HK" />,
    )

    expect(markup).toContain("經典 4R 相片沖印")
    expect(markup).toContain("相片沖印")
    expect(markup).toContain("缺貨")
    expect(markup).not.toContain("Out of stock")
  })

  it("keeps filter validation, live query access, cache tagging, and not-found behavior at route boundaries", () => { const categoryRoute = readFileSync(new URL("../../app/[locale]/categories/[handle]/page.tsx", import.meta.url), "utf8"); const productRoute = readFileSync(new URL("../../app/[locale]/products/[handle]/page.tsx", import.meta.url), "utf8"); const catalogView = readFileSync(new URL("../lib/catalog-view.ts", import.meta.url), "utf8"); expect(categoryRoute).toContain("getCatalogView(locale)"); expect(categoryRoute).toMatch(/if \(!view\)\s*\{\s*notFound\(\)/); expect(productRoute).toContain("getCatalogView(locale)"); expect(productRoute).toMatch(/if \(!view\)\s*\{\s*notFound\(\)/); expect(catalogView).toContain("getCatalogCategories(locale)"); expect(catalogView).toContain("revalidate: CATALOG_REVALIDATE_SECONDS"); expect(catalogView).toContain('tags: ["catalog"]') })

  it("uses dynamic SSR for the live catalog homepage", () => {
    const homeRoute = readFileSync(new URL("../../app/[locale]/page.tsx", import.meta.url), "utf8")

    expect(homeRoute).toContain('export const dynamic = "force-dynamic"')
  })})