"use client"

import React, { useState } from "react"
import { ShoppingBag } from "lucide-react"
import { t, type Locale, type Product } from "@fotomax/shared"
import { useOptionalCart } from "./cart-provider"

export function AddToCartButton({ product, locale }: { product: Product; locale: Locale }) {
  const cart = useOptionalCart()
  const [added, setAdded] = useState(false)

  return (
    <>
      <button
        className="button primary wide"
        type="button"
        disabled={!cart}
        onClick={() => {
          if (!cart) {
            return
          }

          cart.addItem(product)
          setAdded(true)
        }}
      >
        <ShoppingBag size={18} aria-hidden="true" />
        <span>{t(locale, "addToCart")}</span>
      </button>
      <span className="cart-command-status" role="status" aria-live="polite" aria-atomic="true">
        {added ? t(locale, "addedToCart") : ""}
      </span>
    </>
  )
}
