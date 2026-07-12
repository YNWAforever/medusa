"use client"

import React from "react"
import { ShoppingBag } from "lucide-react"
import { t } from "@fotomax/shared"
import type { CatalogProduct, Locale } from "../lib/medusa/contracts"
import { useOptionalCart } from "./cart-provider"

export function AddToCartButton({ product, locale }: { product: CatalogProduct; locale: Locale }) {
  const cart = useOptionalCart()
  const variant = product.variants.find((candidate) => candidate.inventory.available)
  const quantity = variant ? cart?.items.find((item) => item.variantId === variant.id)?.quantity ?? 0 : 0
  const unavailable = product.commerceMode !== "retail" || !variant
  const command = quantity === 0 ? t(locale, "addToCart") : locale === "zh-HK" ? "再加一件" : "Add another"
  const feedback = cart?.mutationError ? "Unable to update your cart. Please try again." : quantity === 0 ? "" : locale === "zh-HK" ? "已加入購物車，數量 " + quantity : "Added to cart, " + quantity + " " + (quantity === 1 ? "item" : "items")

  return <><button className="button primary wide" type="button" disabled={!cart || unavailable} onClick={() => { if (variant) void cart?.addVariant(variant.id, 1) }}><ShoppingBag size={18} aria-hidden="true" /><span>{unavailable ? "Online ordering unavailable" : command}</span></button><span className="cart-command-status" role="status" aria-live="polite" aria-atomic="true">{feedback}</span></>
}
