import { readFileSync } from "node:fs"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { t } from "@fotomax/shared"
import type { ServiceEntry } from "../content/services"
import { serviceEntries } from "../content/services"
import type { CartView, CatalogCategory, CatalogProduct, Locale } from "../lib/medusa/contracts"
import { formatCatalogMoney, getProductView } from "../lib/catalog-filters"
import RootNotFound from "../../app/global-not-found"
import CartPage from "../../app/[locale]/cart/page"
import ServiceRoute from "../../app/[locale]/services/[handle]/page"
import { AddToCartButton } from "./add-to-cart-button"
import { CartDrawer } from "./cart-drawer"
import { CartProvider } from "./cart-provider"
import { ProductDetail } from "./product-detail"
import { SiteHeader } from "./site-header"

const product: CatalogProduct = { id: "prod_print", handle: "classic-4r-photo-print", title: "Classic 4R Photo Print", description: "Standard-size prints.", thumbnail: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80", collectionHandle: "photo-print", badge: "Popular service", commerceMode: "retail", variants: [{ id: "variant_print", title: "Default", sku: "PRINT", options: [{ name: "Paper finish", value: "Glossy" }], price: { amount: 280, currencyCode: "hkd" }, inventory: { managed: true, available: true, quantity: 8 } }] }
const category: CatalogCategory = { id: "pcol_print", handle: "photo-print", title: "Photo Print", summary: "Fast prints.", products: [product] }
const productView = getProductView([category], product.handle)!
const service: ServiceEntry = serviceEntries[0]!
const cartFor = (quantity: number): CartView => ({ id: quantity === 0 ? null : "cart_123", currencyCode: "hkd", items: quantity === 0 ? [] : [{ id: "line_123", kind: "retail", variantId: product.variants[0]!.id, title: product.title, thumbnail: product.thumbnail, quantity, unitPrice: product.variants[0]!.price, subtotal: { amount: product.variants[0]!.price.amount * quantity, currencyCode: "hkd" }, photoJobVersionId: null, photoCount: null }], itemCount: quantity, subtotal: { amount: product.variants[0]!.price.amount * quantity, currencyCode: "hkd" }, shippingTotal: { amount: 0, currencyCode: "hkd" }, taxTotal: { amount: 0, currencyCode: "hkd" }, total: { amount: product.variants[0]!.price.amount * quantity, currencyCode: "hkd" }, email: null })
function renderDrawer(locale: Locale, quantity = 0) {
  return renderToStaticMarkup(
    <CartProvider initialCart={cartFor(quantity)}>
      <CartDrawer locale={locale} />
    </CartProvider>,
  )
}

function renderAddButton(locale: Locale, quantity = 0) {
  return renderToStaticMarkup(
    <CartProvider initialCart={cartFor(quantity)}>
      <AddToCartButton product={product} locale={locale} />
    </CartProvider>,
  )
}

describe("Fotomax cart and service composition", () => {
  it("keeps the cart drawer absent while the cart is empty", () => {
    expect(renderDrawer("en")).toBe("")
  })

  it.each([
    ["en", "Cart", "Clear cart options", "Collapse cart", "Subtotal", "View cart"],
    ["zh-HK", "購物車", "清空購物車選項", "收起購物車", "小計", "查看購物車"],
  ] as const)(
    "renders a populated localized drawer without exposing destructive confirmation in %s",
    (locale, cart, clearOptions, collapse, subtotal, viewCart) => {
      const markup = renderDrawer(locale, 2)

      expect(markup).toContain(`<aside class="cart-drawer" aria-label="${cart}">`)
      expect(markup).toContain('class="cart-line-quantity">2 x')
      expect(markup).toContain(formatCatalogMoney(product.variants[0].price, locale))
      expect(markup).toContain(`${subtotal}</span>`)
      expect(markup).toContain(formatCatalogMoney({ amount: product.variants[0].price.amount * 2, currencyCode: "hkd" }, locale))
      expect(markup).toContain(`aria-label="${clearOptions}"`)
      expect(markup).toContain('aria-controls="cart-clear-confirmation"')
      expect(markup).toContain('aria-expanded="false"')
      expect(markup).toContain(`aria-label="${collapse}"`)
      expect(markup).toContain(`href="/${locale}/cart"`)
      expect(markup).toContain(`>${viewCart}</a>`)
      expect(markup).not.toContain(
        locale === "zh-HK" ? "要移除購物車內所有商品嗎？" : "Remove every item from your cart?",
      )
      expect(markup).not.toContain(locale === "zh-HK" ? ">確認清空</button>" : ">Clear cart</button>")
      expect(markup).not.toContain(locale === "zh-HK" ? ">保留商品</button>" : ">Keep items</button>")
    },
  )

  it.each([
    ["en", "Add another", "Added to cart, 1 item", "Added to cart, 2 items"],
    ["zh-HK", "再加一件", "已加入購物車，數量 1", "已加入購物車，數量 2"],
  ] as const)("keeps the add command separate from quantity feedback in %s", (locale, addAnother, oneItem, twoItems) => {
    const empty = renderAddButton(locale)
    const one = renderAddButton(locale, 1)
    const two = renderAddButton(locale, 2)
    const detail = renderToStaticMarkup(
      <CartProvider>
        <ProductDetail product={productView.product} category={productView.category} locale={locale} />
      </CartProvider>,
    )
    const emptyButton = empty.match(/<button[\s\S]*?<\/button>/)?.[0] ?? ""
    const oneButton = one.match(/<button[\s\S]*?<\/button>/)?.[0] ?? ""
    const twoButton = two.match(/<button[\s\S]*?<\/button>/)?.[0] ?? ""
    const emptyStatus = empty.match(/<span class="cart-command-status"[\s\S]*?<\/span>/)?.[0] ?? ""
    const oneStatus = one.match(/<span class="cart-command-status"[\s\S]*?<\/span>/)?.[0] ?? ""
    const twoStatus = two.match(/<span class="cart-command-status"[\s\S]*?<\/span>/)?.[0] ?? ""

    for (const markup of [empty, one, two, detail]) {
      expect(markup).toContain('type="button"')
      expect(markup).toContain('aria-live="polite"')
      expect(markup).not.toContain("disabled")
    }

    expect(emptyButton).toContain(`>${t(locale, "addToCart")}</span>`)
    expect(detail).toContain(`>${t(locale, "addToCart")}</span>`)
    expect(oneButton).toContain(`>${addAnother}</span>`)
    expect(twoButton).toContain(`>${addAnother}</span>`)
    expect(oneButton).not.toContain(oneItem)
    expect(twoButton).not.toContain(twoItems)
    expect(emptyStatus).not.toContain(t(locale, "addToCart"))
    expect(oneStatus).toContain(`>${oneItem}</span>`)
    expect(twoStatus).toContain(`>${twoItems}</span>`)
    expect(oneStatus).not.toBe(twoStatus)
    expect(detail).not.toContain(locale === "zh-HK" ? "網上訂購即將推出</p>" : "Online ordering coming soon</p>")
  })

  it("uses explicit clear confirmation and provider-owned drawer visibility contracts", () => {
    const drawerSource = readFileSync(new URL("./cart-drawer.tsx", import.meta.url), "utf8")
    const providerSource = readFileSync(new URL("./cart-provider.tsx", import.meta.url), "utf8")
    const addButtonSource = readFileSync(new URL("./add-to-cart-button.tsx", import.meta.url), "utf8")

    expect(drawerSource).toContain("isConfirmingClear")
    expect(drawerSource).toContain("setIsConfirmingClear(true)")
    expect(drawerSource).toContain('id="cart-clear-confirmation"')
    expect(drawerSource).toContain("clearCart()")
    expect(drawerSource).toContain("setIsConfirmingClear(false)")
    expect(drawerSource.match(/clearCart\(\)/g)).toHaveLength(1)
    expect(drawerSource).toContain("closeCart")
    expect(drawerSource).toContain("openCart")
    expect(drawerSource).toContain('className="cart-reopen"')
    expect(drawerSource).toContain("aria-label={reopenLabel}")
    expect(drawerSource).toContain("itemCount")
    expect(drawerSource).not.toContain("window.confirm")

    expect(providerSource).toContain("isDrawerOpen")
    expect(providerSource).toContain("setIsDrawerOpen(true)")
    expect(providerSource).toContain("async addVariant")
    expect(providerSource).toContain('await mutate("/api/cart/items"')
    expect(providerSource).toContain("openCart")
    expect(providerSource).toContain("closeCart")

    expect(addButtonSource).not.toContain("useState")
    expect(addButtonSource).not.toContain("setAdded")
    expect(addButtonSource).toContain("cart?.items.find")
  })

  it("uses render-driven focus restoration for every conditional cart control", () => {
    const drawerSource = readFileSync(new URL("./cart-drawer.tsx", import.meta.url), "utf8")
    const headerMarkup = renderToStaticMarkup(<SiteHeader locale="en" />)
    const drawerMarkup = renderDrawer("en", 2)
    const firstConditionalReturn = drawerSource.indexOf("if (items.length === 0)")

    expect(headerMarkup).toContain('id="header-cart-link"')
    expect(drawerMarkup).toContain('id="cart-clear-trigger"')
    expect(drawerMarkup).toContain('id="cart-collapse-button"')
    expect(drawerSource).toContain('id="cart-reopen-button"')

    expect(drawerSource).toContain("useEffect")
    expect(drawerSource).toContain("useRef")
    expect(drawerSource).toContain("clearTriggerRef")
    expect(drawerSource).toContain("collapseButtonRef")
    expect(drawerSource).toContain("reopenButtonRef")
    expect(drawerSource).toContain("focusTarget")
    expect(drawerSource).toContain('setFocusTarget("reopen")')
    expect(drawerSource).toContain('setFocusTarget("collapse")')
    expect(drawerSource).toContain('setFocusTarget("clear-trigger")')
    expect(drawerSource).toContain('setFocusTarget("header-cart")')
    expect(drawerSource).toContain('document.getElementById("header-cart-link")')
    expect(drawerSource).toMatch(/\.focus\(\)/)
    expect(drawerSource).not.toContain("setTimeout")
    expect(drawerSource.indexOf("useEffect")).toBeLessThan(firstConditionalReturn)
    expect(drawerSource.indexOf("useRef")).toBeLessThan(firstConditionalReturn)
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

  it.each([
    ["en", "Page not found", "The requested Fotomax page is not available.", "Back to homepage"],
    ["zh-HK", "找不到頁面", "你所尋找的 Fotomax 頁面不存在或已被移除。", "返回首頁"],
  ] as const)("renders the closest localized not-found content in %s", async (locale, heading, summary, back) => {
    const { LocalizedNotFound } = await import("./localized-not-found")
    const markup = renderToStaticMarkup(<LocalizedNotFound locale={locale} />)

    expect(markup).toContain('<main id="main-content"')
    expect(markup.match(/<h1>/g)).toHaveLength(1)
    expect(markup).toContain(`<h1>${heading}</h1>`)
    expect(markup).toContain(summary)
    expect(markup).toContain(`href="/${locale}"`)
    expect(markup).toContain(`>${back}</a>`)
  })

  it("offers both locales from the root not-found fallback", () => {
    const markup = renderToStaticMarkup(<RootNotFound />)

    expect(markup).toContain('<main id="main-content"')
    expect(markup.match(/<h1>/g)).toHaveLength(1)
    expect(markup).toContain('href="/en"')
    expect(markup).toContain('href="/zh-HK"')
    expect(markup).toContain(">English</a>")
    expect(markup).toContain(">繁體中文</a>")
  })

  it("routes an unknown service through the locale not-found boundary", async () => {
    await expect(
      ServiceRoute({ params: Promise.resolve({ locale: "en", handle: "unknown-service" }) }),
    ).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/)

    const boundarySource = readFileSync(
      new URL("../../app/[locale]/not-found.tsx", import.meta.url),
      "utf8",
    )

    expect(boundarySource).toContain('"use client"')
    expect(boundarySource).toContain("useParams")
    expect(boundarySource).toContain("isLocale")
    expect(boundarySource).toContain("<LocalizedNotFound locale={locale} />")
  })

  it("defines touch-sized, scroll-bounded cart interactions with visible states", () => {
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8")
    const drawerRule = css.match(/\.cart-drawer\s*\{([^}]*)\}/s)?.[1] ?? ""
    const iconRule = css.match(/\.cart-icon-button\s*\{([^}]*)\}/s)?.[1] ?? ""
    const confirmationRule = css.match(/\.cart-clear-confirmation\s*\{([^}]*)\}/s)?.[1] ?? ""
    const confirmationButtonRule = css.match(/\.cart-clear-actions button\s*\{([^}]*)\}/s)?.[1] ?? ""
    const reopenRule = css.match(/\.cart-reopen\s*\{([^}]*)\}/s)?.[1] ?? ""
    const mobileStart = css.lastIndexOf("@media (max-width: 620px)")
    const mobileCss = css.slice(mobileStart)

    expect(drawerRule).toMatch(/max-height:\s*calc\(100dvh\s*-\s*36px\)/)
    expect(drawerRule).toMatch(/overflow-y:\s*auto/)
    expect(iconRule).toMatch(/width:\s*44px/)
    expect(iconRule).toMatch(/height:\s*44px/)
    expect(confirmationButtonRule).toMatch(/min-height:\s*44px/)
    expect(reopenRule).toMatch(/min-width:\s*44px/)
    expect(reopenRule).toMatch(/min-height:\s*44px/)
    expect(confirmationRule).not.toMatch(/background|box-shadow|border-radius/)
    expect(css).toContain(".cart-icon-button:hover")
    expect(css).toContain(".cart-icon-button:focus-visible")
    expect(css).toContain(".cart-clear-actions button:hover")
    expect(css).toContain(".cart-reopen:hover")
    expect(css).toContain(".cart-reopen:focus-visible")
    expect(css).toContain(".button:hover")
    expect(css).toContain(".button:focus-visible")
    expect(mobileCss).toMatch(/\.cart-drawer\s*\{[^}]*max-height:\s*calc\(100dvh\s*-\s*20px\)/s)
    expect(css).not.toMatch(/font-size:\s*clamp\(/)
  })
})
