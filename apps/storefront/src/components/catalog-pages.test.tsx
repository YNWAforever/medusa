import { readFileSync } from "node:fs"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { getCategory, getProductsByCategory, getServiceEntry, localize, type Locale } from "@fotomax/shared"
import { getProductView, type ProductFilter } from "../lib/catalog-view"
import { CategoryPage } from "./category-page"
import { ProductDetail } from "./product-detail"

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>()

  return {
    ...actual,
    usePathname: () => "/en/categories/photo-print",
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
  }
})

const category = getCategory("photo-print")!
const products = getProductsByCategory(category.handle)
const services = [getServiceEntry("upload-photo-print"), getServiceEntry("store-pickup")].filter(
  (service) => service !== undefined,
)
const productView = getProductView("classic-4r-photo-print")!

function renderCatalog(locale: Locale, initialFilter: ProductFilter = "all") {
  return {
    category: renderToStaticMarkup(
      <CategoryPage category={category} products={products} locale={locale} initialFilter={initialFilter} />,
    ),
    product: renderToStaticMarkup(
      <ProductDetail product={productView.product} category={productView.category} locale={locale} />,
    ),
  }
}

describe("Fotomax catalog page composition", () => {
  it.each([
    ["en", "Products"],
    ["zh-HK", "產品"],
  ] as const)("renders a clear localized heading hierarchy in %s", (locale, productListHeading) => {
    const markup = renderCatalog(locale)

    expect(markup.category.match(/<h1>/g)).toHaveLength(1)
    expect(markup.category).toContain(`<h1>${localize(category.hero, locale)}</h1>`)
    expect(markup.category).toContain(`<h2>${productListHeading}</h2>`)
    expect(markup.category.match(/<h3>/g)).toHaveLength(products.length)
    expect(markup.category).not.toMatch(/<h[4-6]>/)
    expect(markup.product.match(/<h1>/g)).toHaveLength(1)
    expect(markup.product).toContain(`<h1>${localize(productView.product.name, locale)}</h1>`)
  })

  it.each(["en", "zh-HK"] as const)("renders complete localized catalog destinations in %s", (locale) => {
    const markup = renderCatalog(locale)

    expect(markup.category).toContain('<main id="main-content">')
    expect(markup.product).toContain('id="main-content"')
    expect(markup.product).toContain(`href="/${locale}/categories/${category.handle}"`)

    for (const product of products) {
      expect(markup.category).toContain(`href="/${locale}/products/${product.handle}"`)
    }

    for (const service of services) {
      expect(markup.category).toContain(`href="/${locale}/services/${service.handle}"`)
    }

    expect(markup.category.match(/class="product-card"/g)).toHaveLength(products.length)
  })

  it.each([
    ["en", "Product filters", ["All", "Featured", "Available"]],
    ["zh-HK", "產品篩選", ["全部", "精選", "現貨產品"]],
  ] as const)("renders three real filter buttons in %s", (locale, groupLabel, labels) => {
    const { category: markup } = renderCatalog(locale)

    expect(markup).toContain(`role="group" aria-label="${groupLabel}"`)
    expect(markup.match(/<button/g)).toHaveLength(3)
    expect(markup).toContain('aria-pressed="true"')
    expect(markup.match(/aria-pressed="false"/g)).toHaveLength(2)

    for (const label of labels) {
      expect(markup).toContain(`>${label}</button>`)
    }
  })

  it.each([
    ["en", "featured", "Featured", 1],
    ["zh-HK", "available", "現貨產品", 1],
  ] as const)("renders the URL-backed initial filter selection in %s", (locale, filter, label, cardCount) => {
    const { category: markup } = renderCatalog(locale, filter)

    expect(markup).toMatch(new RegExp(`<button[^>]*aria-pressed="true"[^>]*>${label}</button>`))
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(markup.match(/class="product-card"/g) ?? []).toHaveLength(cardCount)
  })

  it("uses optimized decorative category media and descriptive product media", () => {
    const markup = renderCatalog("en")
    const categoryHeroImage =
      markup.category.match(/<img[^>]*class="category-hero-image"[^>]*>/)?.[0] ?? ""
    const firstCategoryProductCard =
      markup.category.match(/<article class="product-card">([\s\S]*?)<\/article>/)?.[1] ?? ""

    expect(markup.category).toMatch(/<img alt=""[^>]*class="category-hero-image"[^>]*sizes="100vw"/)
    expect(categoryHeroImage).toContain('loading="eager"')
    expect(categoryHeroImage).toContain('fetchPriority="high"')
    expect(firstCategoryProductCard).toContain('loading="eager"')
    expect(firstCategoryProductCard).toContain('fetchPriority="high"')
    expect(markup.product).toMatch(
      /<img alt="Classic 4R Photo Print"[^>]*class="product-detail-image"[^>]*sizes="\(max-width: 920px\) 100vw, 60vw"/,
    )
  })

  it("loads the above-fold product detail image eagerly at high priority", () => {
    const markup = renderCatalog("en").product
    const imageMarkup = markup.match(/<img[^>]*class="product-detail-image"[^>]*>/)?.[0] ?? ""

    expect(imageMarkup).toContain('loading="eager"')
    expect(imageMarkup).toContain('fetchPriority="high"')
  })

  it.each(["en", "zh-HK"] as const)("presents product options as read-only information in %s", (locale) => {
    const { product: markup } = renderCatalog(locale)
    const optionStart = markup.indexOf('<section class="option-stack"')
    const optionEnd = markup.indexOf('<p class="availability-note"', optionStart)
    const optionMarkup = markup.slice(optionStart, optionEnd)

    for (const option of productView.product.options) {
      expect(markup).toContain(localize(option.name, locale))

      for (const value of option.values) {
        expect(markup).toContain(localize(value, locale))
      }
    }

    expect(optionMarkup).toContain(locale === "zh-HK" ? "產品資料" : "Product details")
    expect(optionMarkup).not.toContain(locale === "zh-HK" ? "產品選項" : "Product options")
    expect(optionMarkup).toContain('<dl class="option-list">')
    expect(optionMarkup).toContain(`<dt>${localize(productView.product.options[0].name, locale)}</dt>`)
    expect(optionMarkup).toContain(`<li>${localize(productView.product.options[0].values[0], locale)}</li>`)
    expect(optionMarkup).not.toMatch(/<(button|input|select|textarea|form|span)\b/)
  })

  it.each([
    ["en", "Browse categories"],
    ["zh-HK", "瀏覽產品分類"],
  ] as const)("uses a descriptive localized empty-category link in %s", (locale, linkLabel) => {
    const markup = renderToStaticMarkup(
      <CategoryPage category={category} products={[]} locale={locale} initialFilter="all" />,
    )

    expect(markup).toContain(`href="/${locale}"`)
    expect(markup).toContain(`>${linkLabel}</a>`)
    expect(markup).not.toContain('>Fotomax</a>')
  })

  it("uses customer-facing coming-soon language in both locales", () => {
    const english = renderCatalog("en")
    const chinese = renderCatalog("zh-HK")
    const englishMarkup = `${english.category}${english.product}`
    const chineseMarkup = `${chinese.category}${chinese.product}`

    expect(englishMarkup).toContain("Coming soon")
    expect(chineseMarkup).toContain("即將推出")
    expect(englishMarkup).not.toMatch(/next phase|medusa|implementation|phase 1/i)
    expect(chineseMarkup).not.toMatch(/下一階段|Medusa|實作|第一階段/i)
  })

  it("defines touch-sized filter controls with stable responsive typography", () => {
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8")
    const tabletStart = css.indexOf("@media (max-width: 920px)")
    const mobileStart = css.indexOf("@media (max-width: 620px)")
    const tabletCss = css.slice(tabletStart, mobileStart)
    const optionGroupRule = css.match(/\.option-group\s*\{([^}]*)\}/s)?.[1] ?? ""

    expect(css).toMatch(/\.filter-row button\s*\{[^}]*min-height:\s*44px/s)
    expect(css).toMatch(/\.product-info \.availability-note\s*\{[^}]*color:\s*var\(--color-red-text\)/s)
    expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*\.category-hero h1\s*\{[^}]*font-size:\s*2\.5rem/s)
    expect(tabletCss).toMatch(/\.product-gallery\s*\{[^}]*min-height:\s*0[^}]*aspect-ratio:\s*4\s*\/\s*3/s)
    expect(tabletCss).not.toContain("min-height: 360px")
    expect(css).not.toContain(".option-stack span")
    expect(optionGroupRule).not.toMatch(/border|border-radius|background/)
    expect(css).not.toMatch(/font-size:\s*clamp\(/)
  })

  it("keeps filter validation and not-found behavior at route boundaries", () => {
    const categoryRoute = readFileSync(
      new URL("../../app/[locale]/categories/[handle]/page.tsx", import.meta.url),
      "utf8",
    )
    const productRoute = readFileSync(
      new URL("../../app/[locale]/products/[handle]/page.tsx", import.meta.url),
      "utf8",
    )
    const filterSource = readFileSync(new URL("./category-product-grid.tsx", import.meta.url), "utf8")

    expect(categoryRoute).toContain("searchParams: Promise")
    expect(categoryRoute).toContain("parseProductFilter(filter)")
    expect(categoryRoute).toContain("initialFilter={initialFilter}")
    expect(categoryRoute).toMatch(/if \(!view\)\s*\{\s*notFound\(\)/)
    expect(productRoute).toMatch(/if \(!view\)\s*\{\s*notFound\(\)/)
    expect(filterSource).toContain("buildCategoryFilterHref")
    expect(filterSource).toContain("router.replace")
  })

  it("keeps the filter grid mounted and uses the validated URL filter as its single source of truth", () => {
    const categoryPageSource = readFileSync(new URL("./category-page.tsx", import.meta.url), "utf8")
    const filterSource = readFileSync(new URL("./category-product-grid.tsx", import.meta.url), "utf8")

    expect(categoryPageSource).not.toContain("key={initialFilter}")
    expect(filterSource).not.toMatch(/\buseState\b/)
    expect(filterSource).not.toContain("setFilter")
    expect(filterSource).toContain("filterProducts(products, initialFilter)")
    expect(filterSource).toContain("aria-pressed={initialFilter === value}")
    expect(filterSource).toContain('selectFilter("all")')
    expect(filterSource).toContain("router.replace")
  })
})
