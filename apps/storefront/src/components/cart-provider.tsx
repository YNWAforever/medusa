"use client"

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { CartLineView, CartView } from "../lib/medusa/contracts"

interface CartContextValue {
  cart: CartView
  items: CartLineView[]
  isDrawerOpen: boolean
  isLoading: boolean
  isMutating: boolean
  mutationError: string | null
  refresh: () => Promise<void>
  addVariant: (variantId: string, quantity: number) => Promise<void>
  updateLine: (lineId: string, quantity: number) => Promise<void>
  removeLine: (lineId: string) => Promise<void>
  clearCart: () => Promise<void>
  openCart: () => void
  closeCart: () => void
}

const emptyCart: CartView = {
  id: null,
  currencyCode: "hkd",
  items: [],
  itemCount: 0,
  subtotal: { amount: 0, currencyCode: "hkd" },
  shippingTotal: { amount: 0, currencyCode: "hkd" },
  taxTotal: { amount: 0, currencyCode: "hkd" },
  total: { amount: 0, currencyCode: "hkd" },
  email: null,
}

const CartContext = createContext<CartContextValue | null>(null)

async function cartRequest(path: string, init?: RequestInit): Promise<CartView> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  })
  const body: { cart?: CartView; error?: { code?: string } } = await response.json()

  if (!response.ok || !body.cart) {
    throw new Error(body.error?.code ?? "cart_unavailable")
  }

  return body.cart
}

export function CartProvider({
  children,
  initialCart = emptyCart,
}: {
  children: ReactNode
  initialCart?: CartView
}) {
  const [cart, setCart] = useState<CartView>(initialCart)
  const [isDrawerOpen, setIsDrawerOpen] = useState(initialCart.items.length > 0)
  const [isLoading, setIsLoading] = useState(true)
  const [isMutating, setIsMutating] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const mutationLock = useRef(false)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      setCart(await cartRequest("/api/cart"))
      setMutationError(null)
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "cart_unavailable")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const mutate = useCallback(async (path: string, init: RequestInit) => {
    if (mutationLock.current) {
      return
    }

    mutationLock.current = true
    setIsMutating(true)
    try {
      setCart(await cartRequest(path, init))
      setMutationError(null)
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "cart_unavailable")
    } finally {
      mutationLock.current = false
      setIsMutating(false)
    }
  }, [])

  const clearCart = useCallback(async () => {
    if (mutationLock.current) {
      return
    }

    mutationLock.current = true
    setIsMutating(true)
    try {
      let nextCart = cart
      for (const item of cart.items) {
        nextCart = await cartRequest(
          "/api/cart/items/" + encodeURIComponent(item.id),
          { method: "DELETE" },
        )
        setCart(nextCart)
      }
      setMutationError(null)
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "cart_unavailable")
    } finally {
      mutationLock.current = false
      setIsMutating(false)
    }
  }, [cart])

  const value = useMemo<CartContextValue>(() => ({
    cart,
    items: cart.items,
    isDrawerOpen,
    isLoading,
    isMutating,
    mutationError,
    refresh,
    async addVariant(variantId, quantity) {
      await mutate("/api/cart/items", {
        method: "POST",
        body: JSON.stringify({ variantId, quantity }),
      })
    },
    async updateLine(lineId, quantity) {
      await mutate("/api/cart/items/" + encodeURIComponent(lineId), {
        method: "PATCH",
        body: JSON.stringify({ quantity }),
      })
    },
    async removeLine(lineId) {
      await mutate("/api/cart/items/" + encodeURIComponent(lineId), {
        method: "DELETE",
      })
    },
    clearCart,
    openCart() {
      setIsDrawerOpen(true)
    },
    closeCart() {
      setIsDrawerOpen(false)
    },
  }), [
    cart,
    clearCart,
    isDrawerOpen,
    isLoading,
    isMutating,
    mutate,
    mutationError,
    refresh,
  ])

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
