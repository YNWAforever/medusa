"use client"

import Link from "next/link"
import { ChevronDown, ShoppingBag, Trash2 } from "lucide-react"
import React, { useState } from "react"
import { formatPrice, localize, t, type Locale } from "@fotomax/shared"
import { getCartSubtotal } from "../lib/cart-state"
import { localeHref } from "../lib/locales"
import { useCart } from "./cart-provider"

export function CartDrawer({ locale }: { locale: Locale }) {
  const { items, isDrawerOpen, clearCart, closeCart, openCart } = useCart()
  const [isConfirmingClear, setIsConfirmingClear] = useState(false)
  const itemCount = items.reduce((total, item) => total + item.quantity, 0)

  if (items.length === 0) {
    return null
  }

  if (!isDrawerOpen) {
    const reopenLabel =
      locale === "zh-HK" ? `展開購物車，${itemCount} 件商品` : `Open cart, ${itemCount} ${itemCount === 1 ? "item" : "items"}`

    return (
      <button className="cart-reopen" type="button" onClick={openCart} aria-label={reopenLabel} title={reopenLabel}>
        <ShoppingBag size={18} aria-hidden="true" />
        <span>{locale === "zh-HK" ? `購物車（${itemCount}）` : `Cart (${itemCount})`}</span>
      </button>
    )
  }

  const clearOptionsLabel = locale === "zh-HK" ? "清空購物車選項" : "Clear cart options"
  const collapseLabel = locale === "zh-HK" ? "收起購物車" : "Collapse cart"

  return (
    <aside className="cart-drawer" aria-label={t(locale, "cart")}>
      <div className="cart-drawer-header">
        <strong>
          <ShoppingBag size={18} aria-hidden="true" />
          {t(locale, "cart")}
        </strong>
        <div className="cart-drawer-actions">
          <button
            className="cart-icon-button"
            type="button"
            onClick={() => setIsConfirmingClear(true)}
            aria-label={clearOptionsLabel}
            aria-controls="cart-clear-confirmation"
            aria-expanded={isConfirmingClear}
            title={clearOptionsLabel}
          >
            <Trash2 size={17} aria-hidden="true" />
          </button>
          <button
            className="cart-icon-button"
            type="button"
            onClick={() => {
              setIsConfirmingClear(false)
              closeCart()
            }}
            aria-label={collapseLabel}
            title={collapseLabel}
          >
            <ChevronDown size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      {isConfirmingClear ? (
        <div
          className="cart-clear-confirmation"
          id="cart-clear-confirmation"
          role="group"
          aria-label={locale === "zh-HK" ? "清空購物車確認" : "Clear cart confirmation"}
        >
          <p>{locale === "zh-HK" ? "要移除購物車內所有商品嗎？" : "Remove every item from your cart?"}</p>
          <div className="cart-clear-actions">
            <button
              className="cart-clear-confirm"
              type="button"
              onClick={() => {
                clearCart()
                setIsConfirmingClear(false)
              }}
            >
              {locale === "zh-HK" ? "確認清空" : "Clear cart"}
            </button>
            <button type="button" onClick={() => setIsConfirmingClear(false)}>
              {locale === "zh-HK" ? "保留商品" : "Keep items"}
            </button>
          </div>
        </div>
      ) : null}
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
