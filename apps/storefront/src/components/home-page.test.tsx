import { readFileSync } from "node:fs"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { categories, products, serviceEntries, type Locale } from "@fotomax/shared"
import { HomePage } from "./home-page"
import { SiteHeader } from "./site-header"

describe("Fotomax homepage composition", () => {
  const renderLocale = (locale: Locale) => ({
    header: renderToStaticMarkup(<SiteHeader locale={locale} />),
    page: renderToStaticMarkup(<HomePage locale={locale} />),
  })

  it.each([
    ["en", "Cart"],
    ["zh-HK", "購物車"],
  ] as const)("renders complete %s commerce paths with a persistent cart name", (locale, cartLabel) => {
    const { header, page } = renderLocale(locale)

    for (const category of categories) {
      expect(header).toContain(`href="/${locale}/categories/${category.handle}"`)
      expect(page).toContain(`href="/${locale}/categories/${category.handle}"`)
    }

    for (const product of products.slice(0, 4)) {
      expect(page).toContain(`href="/${locale}/products/${product.handle}"`)
    }

    for (const service of serviceEntries) {
      expect(page).toContain(`href="/${locale}/services/${service.handle}"`)
    }

    expect(header).toContain(`aria-label="${cartLabel}"`)
    expect(header).toContain(`href="/${locale}/services/store-pickup"`)
    expect(header).not.toContain('aria-label="Search"')
  })

  it("renders accessible page structure and optimized decorative hero media", () => {
    const { page } = renderLocale("en")
    const localeLayout = readFileSync(new URL("../../app/[locale]/layout.tsx", import.meta.url), "utf8")

    expect(localeLayout).toContain('className="skip-link" href="#main-content"')
    expect(page).toContain('<main id="main-content">')
    expect(page.match(/<h1>/g)).toHaveLength(1)
    expect(page.match(/<h2>/g)).toHaveLength(2)
    expect(page.match(/<h3>/g)).toHaveLength(4)
    expect(page).not.toMatch(/<h[4-6]>/)
    expect(page).toContain('<link rel="preload" as="image"')
    expect(page).toContain('imageSizes="100vw"')
    expect(page).toMatch(/<img alt=""[^>]*class="hero-backdrop"[^>]*sizes="100vw"/)
    expect(page.match(/class="product-card"/g)).toHaveLength(4)
  })

  it("uses customer-facing availability copy in both locales", () => {
    const english = renderLocale("en").page
    const chinese = renderLocale("zh-HK").page

    expect(english).toContain("Coming soon")
    expect(chinese).toContain("即將推出")
    expect(english).not.toMatch(/next phase/i)
    expect(chinese).not.toContain("下一階段")
    expect(english).toContain("Photo life, from prints to gifts in one modern shop.")
    expect(chinese).toContain("影像生活，由沖印到禮物一站完成。")
  })

  it("defines the reviewed mobile and interaction styling contract", () => {
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8")
    const mobileStart = css.indexOf("@media (max-width: 620px)")
    const reducedMotionStart = css.indexOf("@media (prefers-reduced-motion: reduce)")
    const mobileCss = css.slice(mobileStart, reducedMotionStart)

    expect(css).toContain("--color-red-text: #b4232f")
    expect(mobileCss).toMatch(/\.home-hero,\s*\.hero-content\s*\{[^}]*min-height:\s*auto/s)
    expect(mobileCss).toMatch(/\.hero-panel\s*\{[^}]*display:\s*none/s)
    expect(mobileCss).toMatch(/\.mega-nav a\s*\{[^}]*min-height:\s*44px[^}]*padding/s)
    expect(css).toContain(".icon-button:hover")
    expect(css).toContain(".product-card:hover")
    expect(css).toContain(".text-link:hover")
    expect(css).toContain(".service-strip a:hover")
  })
})
