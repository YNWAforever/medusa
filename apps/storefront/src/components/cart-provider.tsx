"use client"

import React, { createContext, useContext, useMemo, useState, type ReactNode } from "react"
import type { Product } from "@fotomax/shared"
import { addCartItem, type CartItem } from "../lib/cart-state"

interface CartContextValue {
  items: CartItem[]
  isDrawerOpen: boolean
  addItem: (product: Product) => void
  clearCart: () => void
  openCart: () => void
  closeCart: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children, initialItems = [] }: { children: ReactNode; initialItems?: CartItem[] }) {
  const [items, setItems] = useState<CartItem[]>(initialItems)
  const [isDrawerOpen, setIsDrawerOpen] = useState(initialItems.length > 0)

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      isDrawerOpen,
      addItem(product) {
        setItems((current) => addCartItem(current, product))
      },
      clearCart() {
        setItems([])
      },
      openCart() {
        setIsDrawerOpen(true)
      },
      closeCart() {
        setIsDrawerOpen(false)
      },
    }),
    [isDrawerOpen, items],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)

  if (!context) {
    throw new Error("useCart must be used inside CartProvider")
  }

  return context
}

export function useOptionalCart() {
  return useContext(CartContext)
}
