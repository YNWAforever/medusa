import { Globe2, MapPin, ShoppingBag } from "lucide-react"
import Link from "next/link"
import React from "react"
import { categories, localeLabels, localize, t, type Locale } from "@fotomax/shared"
import { localeHref } from "../lib/locales"

export function SiteHeader({ locale }: { locale: Locale }) {
  const alternateLocale: Locale = locale === "zh-HK" ? "en" : "zh-HK"

  return (
    <header className="site-header">
      <Link className="brand" href={localeHref(locale, "/")}>
        Fotomax
      </Link>
      <nav className="mega-nav" aria-label={locale === "zh-HK" ? "主要導覽" : "Main navigation"}>
        {categories.map((category) => (
          <Link key={category.handle} href={localeHref(locale, `/categories/${category.handle}`)}>
            {localize(category.name, locale)}
          </Link>
        ))}
      </nav>
      <div className="header-actions">
        <Link className="icon-button" href={localeHref(locale, "/services/store-pickup")} aria-label={t(locale, "storePickup")}>
          <MapPin size={18} aria-hidden="true" />
        </Link>
        <Link className="icon-button" href={localeHref(alternateLocale, "/")} aria-label={localeLabels[alternateLocale]}>
          <Globe2 size={18} aria-hidden="true" />
        </Link>
        <Link id="header-cart-link" className="cart-link" href={localeHref(locale, "/cart")} aria-label={t(locale, "cart")}>
          <ShoppingBag size={18} aria-hidden="true" />
          <span>{t(locale, "cart")}</span>
        </Link>
      </div>
    </header>
  )
}
