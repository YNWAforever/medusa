"use client"

import { Trash2 } from "lucide-react"
import React from "react"

import { formatCatalogMoney } from "../lib/catalog-filters"
import { groupVisualCartLines } from "../lib/cart-state"
import type { Locale } from "../lib/medusa/contracts"
import { useOptionalCart } from "./cart-provider"

export function CartPageContent({ locale }: { locale: Locale }) {
  const cart = useOptionalCart()
  if (!cart || !cart.items.length) {
    return <p>{locale === "zh-HK" ? "購物車目前沒有商品。" : "Your cart is empty."}</p>
  }

  return (
    <div className="cart-page-lines">
      {groupVisualCartLines(cart.items).map((group) => {
        const line = group.lines[0]
        if (!line) return null
        const label = group.kind === "photo_print"
          ? locale === "zh-HK" ? `相片沖印（${group.photoCount ?? group.quantity} 張）` : `Photo prints (${group.photoCount ?? group.quantity} photos)`
          : group.title
        return (
          <div className="cart-page-line" key={group.key}>
            <div><strong>{label}</strong><span>{formatCatalogMoney(group.subtotal, locale)}</span></div>
            <button type="button" className="cart-icon-button" onClick={() => void cart.removeLine(line.id)} aria-label={locale === "zh-HK" ? `移除${label}` : `Remove ${label}`} title={locale === "zh-HK" ? "移除" : "Remove"}>
              <Trash2 size={17} aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
