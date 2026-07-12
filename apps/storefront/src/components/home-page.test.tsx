import { readFileSync } from "node:fs"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { CatalogCategory, CatalogProduct, Locale } from "../lib/medusa/contracts"
import { HomePage } from "./home-page"
import { SiteHeader } from "./site-header"

function product(handle: string, title: string): CatalogProduct { return { id: `prod_${handle}`, handle, title, description: `${title} description`, thumbnail: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80", collectionHandle: null, badge: "Featured", commerceMode: "retail", variants: [{ id: `variant_${handle}`, title: "Default", sku: handle, options: [], price: { amount: 7800, currencyCode: "hkd" }, inventory: { managed: true, available: true, quantity: 8 } }] } }
const categories: CatalogCategory[] = [
  { id: "pcol_print", handle: "photo-print", title: "Photo Print", summary: "Fast prints.", products: [product("classic-4r-photo-print", "Classic 4R Photo Print")] },
  { id: "pcol_book", handle: "photobook", title: "Photobook", summary: "Premium books.", products: [product("premium-photobook", "Premium Photobook")] },
  { id: "pcol_gift", handle: "personalized-gifts", title: "Personalized Gifts", summary: "Personal keepsakes.", products: [product("photo-mug", "Photo Mug")] },
  { id: "pcol_film", handle: "instax-film", title: "Instax & Film", summary: "Film packs.", products: [product("instax-mini-film", "Instax Mini Film")] },
]
function renderLocale(locale: Locale) { return { header: renderToStaticMarkup(<SiteHeader locale={locale} categories={categories} />), page: renderToStaticMarkup(<HomePage locale={locale} categories={categories} />) } }

describe("Fotomax homepage composition", () => {
  it.each(["en", "zh-HK"] as const)("renders live DTO category and product destinations in %s", (locale) => { const { header, page } = renderLocale(locale); for (const category of categories) { expect(header).toContain(`href="/${locale}/categories/${category.handle}"`); expect(page).toContain(`href="/${locale}/categories/${category.handle}"`) }; for (const category of categories) for (const item of category.products) expect(page).toContain(`href="/${locale}/products/${item.handle}`); expect(page).toContain(`href="/${locale}/services/store-pickup"`); expect(header).toContain(`href="/${locale}/services/store-pickup"`) })
  it("renders accessible page structure and optimized decorative hero media", () => { const { page } = renderLocale("en"); const localeLayout = readFileSync(new URL("../../app/[locale]/layout.tsx", import.meta.url), "utf8"); expect(localeLayout).toContain('className="skip-link" href="#main-content"'); expect(page).toContain('<main id="main-content">'); expect(page.match(/<h1>/g)).toHaveLength(1); expect(page.match(/<h2>/g)).toHaveLength(2); expect(page.match(/<h3>/g)).toHaveLength(4); expect(page).toContain('<link rel="preload" as="image"'); expect(page).toContain('imageSizes="100vw"'); expect(page).toMatch(/<img alt=""[^>]*class="hero-backdrop"[^>]*sizes="100vw"/); expect(page.match(/class="product-card"/g)).toHaveLength(4) })
  it("keeps customer-facing availability copy independent of catalog fixtures", () => { const english = renderLocale("en").page; expect(english).toContain("Photo life, from prints to gifts in one modern shop."); expect(english).toContain("Coming soon"); expect(english).not.toMatch(/next phase|medusa|implementation/i) })
  it("defines the reviewed mobile and interaction styling contract", () => { const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8"); const mobileStart = css.indexOf("@media (max-width: 620px)"); const reducedMotionStart = css.indexOf("@media (prefers-reduced-motion: reduce)"); const mobileCss = css.slice(mobileStart, reducedMotionStart); expect(css).toContain("--color-red-text: #b4232f"); expect(mobileCss).toMatch(/\.home-hero,\s*\.hero-content\s*\{[^}]*min-height:\s*auto/s); expect(mobileCss).toMatch(/\.hero-panel\s*\{[^}]*display:\s*none/s); expect(css).toContain(".product-card:hover"); expect(css).not.toMatch(/font-size:\s*clamp\(/) })
})