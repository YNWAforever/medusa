"use client"

import Link from "next/link"
import { ShoppingBag, Trash2 } from "lucide-react"
import React from "react"
import { formatPrice, localize, t, type Locale } from "@fotomax/shared"
import { getCartSubtotal } from "../lib/cart-state"
import { localeHref } from "../lib/locales"
import { useCart } from "./cart-provider"

export function CartDrawer({ locale }: { locale: Locale }) {
  const { items, clearCart } = useCart()

  if (items.length === 0) {
    return null
  }

  return (
    <aside className="cart-drawer" aria-label={t(locale, "cart")}>
      <div className="cart-drawer-header">
        <strong>
          <ShoppingBag size={18} aria-hidden="true" />
          {t(locale, "cart")}
        </strong>
        <button
          type="button"
          onClick={clearCart}
          aria-label={locale === "zh-HK" ? "清空購物車" : "Clear cart"}
        >
          <Trash2 size={17} aria-hidden="true" />
        </button>
      </div>
      <div className="cart-lines">
        {items.map((item) => (
          <div className="cart-line" key={item.product.handle}>
            <span>{localize(item.product.name, locale)}</span>
            <strong className="cart-line-quantity">
              {item.quantity} x {formatPrice(item.product.priceCents, locale)}
            </strong>
          </div>
        ))}
      </div>
      <div className="cart-total">
        <span>{locale === "zh-HK" ? "小計" : "Subtotal"}</span>
        <strong>{formatPrice(getCartSubtotal(items), locale)}</strong>
      </div>
      <Link className="button primary wide" href={localeHref(locale, "/cart")}>
        {locale === "zh-HK" ? "查看購物車" : "View cart"}
      </Link>
    </aside>
  )
}
