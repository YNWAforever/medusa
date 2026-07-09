import { readFileSync } from "node:fs"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { formatPrice, getProduct, getServiceEntry, t, type Locale } from "@fotomax/shared"
import CartPage from "../../app/[locale]/cart/page"
import ServiceRoute from "../../app/[locale]/services/[handle]/page"
import { getProductView } from "../lib/catalog-view"
import { AddToCartButton } from "./add-to-cart-button"
import { CartDrawer } from "./cart-drawer"
import { CartProvider } from "./cart-provider"
import { ProductDetail } from "./product-detail"

const product = getProduct("classic-4r-photo-print")!
const productView = getProductView(product.handle)!
const service = getServiceEntry("upload-photo-print")!

function renderDrawer(locale: Locale, quantity = 0) {
  return renderToStaticMarkup(
    <CartProvider initialItems={quantity === 0 ? [] : [{ product, quantity }]}>
      <CartDrawer locale={locale} />
    </CartProvider>,
  )
}

describe("Fotomax cart and service composition", () => {
  it("keeps the cart drawer absent while the cart is empty", () => {
    expect(renderDrawer("en")).toBe("")
  })

  it.each([
    ["en", "Cart", "Clear cart", "Subtotal", "View cart"],
    ["zh-HK", "購物車", "清空購物車", "小計", "查看購物車"],
  ] as const)("renders a populated localized drawer in %s", (locale, cart, clear, subtotal, viewCart) => {
    const markup = renderDrawer(locale, 2)

    expect(markup).toContain(`<aside class="cart-drawer" aria-label="${cart}">`)
    expect(markup).toContain('class="cart-line-quantity">2 x')
    expect(markup).toContain(formatPrice(product.priceCents, locale))
    expect(markup).toContain(`${subtotal}</span>`)
    expect(markup).toContain(formatPrice(product.priceCents * 2, locale))
    expect(markup).toContain(`aria-label="${clear}"`)
    expect(markup).toContain(`href="/${locale}/cart"`)
    expect(markup).toContain(`>${viewCart}</a>`)
  })

  it.each(["en", "zh-HK"] as const)("exposes an enabled localized add command and polite status in %s", (locale) => {
    const button = renderToStaticMarkup(
      <CartProvider>
        <AddToCartButton product={product} locale={locale} />
      </CartProvider>,
    )
    const detail = renderToStaticMarkup(
      <CartProvider>
        <ProductDetail product={productView.product} category={productView.category} locale={locale} />
      </CartProvider>,
    )

    for (const markup of [button, detail]) {
      expect(markup).toContain('type="button"')
      expect(markup).toContain(`>${t(locale, "addToCart")}</span>`)
      expect(markup).toContain('aria-live="polite"')
      expect(markup).not.toContain("disabled")
    }

    expect(detail).not.toContain(locale === "zh-HK" ? "網上訂購即將推出</p>" : "Online ordering coming soon</p>")
  })

  it.each([
    ["en", "Coming soon", "Continue shopping"],
    ["zh-HK", "即將推出", "繼續選購"],
  ] as const)("renders honest cart and service destinations in %s", async (locale, comingSoon, continueShopping) => {
    const cartElement = await CartPage({ params: Promise.resolve({ locale }) })
    const serviceElement = await ServiceRoute({
      params: Promise.resolve({ locale, handle: service.handle }),
    })
    const cart = renderToStaticMarkup(cartElement)
    const serviceMarkup = renderToStaticMarkup(serviceElement)

    for (const markup of [cart, serviceMarkup]) {
      expect(markup.match(/<h1>/g)).toHaveLength(1)
      expect(markup).toContain('<main id="main-content"')
      expect(markup).toContain(comingSoon)
    }

    expect(cart).toContain(`href="/${locale}"`)
    expect(cart).toContain(`>${continueShopping}</a>`)
    expect(serviceMarkup).toContain(`href="/${locale}/categories/${service.categoryHandle}"`)
  })

  it("keeps customer copy honest and wires cart state at the locale boundary", async () => {
    const englishCart = renderToStaticMarkup(
      await CartPage({ params: Promise.resolve({ locale: "en" }) }),
    )
    const chineseService = renderToStaticMarkup(
      await ServiceRoute({
        params: Promise.resolve({ locale: "zh-HK", handle: service.handle }),
      }),
    )
    const detail = renderToStaticMarkup(
      <CartProvider>
        <ProductDetail product={productView.product} category={productView.category} locale="en" />
      </CartProvider>,
    )
    const customerMarkup = `${englishCart}${chineseService}${detail}`
    const localeLayout = readFileSync(new URL("../../app/[locale]/layout.tsx", import.meta.url), "utf8")

    expect(customerMarkup).not.toMatch(/next phase|phase 1|medusa|implementation/i)
    expect(customerMarkup).not.toMatch(/下一階段|第一階段|實作/i)
    expect(customerMarkup).not.toContain("disabled")
    expect(localeLayout).toContain("<CartProvider>")
    expect(localeLayout).toContain("<CartDrawer locale={locale} />")
  })

  it("defines touch-sized, scroll-bounded cart interactions with visible states", () => {
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8")
    const drawerRule = css.match(/\.cart-drawer\s*\{([^}]*)\}/s)?.[1] ?? ""
    const clearRule = css.match(/\.cart-drawer-header button\s*\{([^}]*)\}/s)?.[1] ?? ""
    const mobileStart = css.lastIndexOf("@media (max-width: 620px)")
    const mobileCss = css.slice(mobileStart)

    expect(drawerRule).toMatch(/max-height:\s*calc\(100dvh\s*-\s*36px\)/)
    expect(drawerRule).toMatch(/overflow-y:\s*auto/)
    expect(clearRule).toMatch(/width:\s*44px/)
    expect(clearRule).toMatch(/height:\s*44px/)
    expect(css).toContain(".cart-drawer-header button:hover")
    expect(css).toContain(".cart-drawer-header button:active")
    expect(css).toContain(".cart-drawer-header button:focus-visible")
    expect(css).toContain(".button:hover")
    expect(css).toContain(".button:focus-visible")
    expect(mobileCss).toMatch(/\.cart-drawer\s*\{[^}]*max-height:\s*calc\(100dvh\s*-\s*20px\)/s)
    expect(css).not.toMatch(/font-size:\s*clamp\(/)
  })
})
