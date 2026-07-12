"use client"

import React from "react"
import { ShoppingBag } from "lucide-react"
import { t } from "@fotomax/shared"
import type { CatalogProduct, Locale } from "../lib/medusa/contracts"
import { useOptionalCart } from "./cart-provider"

export function AddToCartButton({
  product,
  locale,
  variantId,
}: {
  product: CatalogProduct
  locale: Locale
  variantId?: string
}) {
  const cart = useOptionalCart()
  const variant = variantId
    ? product.variants.find((candidate) => candidate.id === variantId)
    : product.variants.find((candidate) => candidate.inventory.available)
  const quantity = variant
    ? cart?.items.find((item) => item.variantId === variant.id)?.quantity ?? 0
    : 0
  const unavailable = product.commerceMode !== "retail"
    || !variant
    || !variant.inventory.available
  const command = quantity === 0
    ? t(locale, "addToCart")
    : locale === "zh-HK" ? "再加一件" : "Add another"
  const unavailableLabel = locale === "zh-HK"
    ? "暫時未能網上訂購"
    : "Online ordering unavailable"
  const feedback = cart?.mutationError
    ? locale === "zh-HK"
      ? "未能更新購物車，請重試。"
      : "Unable to update your cart. Please try again."
    : quantity === 0
      ? ""
      : locale === "zh-HK"
        ? "已加入購物車，數量 " + quantity
        : "Added to cart, " + quantity + " " + (quantity === 1 ? "item" : "items")

  return (
    <>
      <button
        className="button primary wide"
        type="button"
        disabled={!cart || unavailable || cart.isMutating}
        onClick={() => {
          if (variant) {
            void cart?.addVariant(variant.id, 1)
          }
        }}
      >
        <ShoppingBag size={18} aria-hidden="true" />
        <span>{unavailable ? unavailableLabel : command}</span>
      </button>
      <span
        className="cart-command-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {feedback}
      </span>
    </>
  )
}
