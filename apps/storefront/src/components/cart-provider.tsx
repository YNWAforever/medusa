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
import { createCartRefreshGuard, groupVisualCartLines } from "../lib/cart-state"
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

class CartRequestError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

/**
 * Both codes mean the server dropped the cart cookie: the cart either expired or
 * could not be projected. Either way the recovery is the same — reset to empty
 * and let the next add-to-cart create a fresh cart.
 */
function isResettableCart(code: string): boolean {
  return code === "cart_expired" || code === "cart_unrecoverable"
}

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
    throw new CartRequestError(body.error?.code ?? "cart_unavailable")
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
  const cartVersion = useRef(0)
  const refreshGuard = useMemo(() => createCartRefreshGuard(cartVersion), [])

  const refresh = useCallback(async () => {
    if (!refreshGuard.canRefresh()) {
      return
    }

    const refreshVersion = refreshGuard.capture()
    setIsLoading(true)
    try {
      const nextCart = await cartRequest("/api/cart")
      if (refreshGuard.isCurrent(refreshVersion)) {
        setCart(nextCart)
        setMutationError(null)
      }
    } catch (error) {
      if (refreshGuard.isCurrent(refreshVersion)) {
        setMutationError(error instanceof Error ? error.message : "cart_unavailable")
      }
    } finally {
      setIsLoading(false)
    }
  }, [refreshGuard])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const mutate = useCallback(async (path: string, init: RequestInit) => {
    if (mutationLock.current) {
      return
    }

    mutationLock.current = true
    refreshGuard.beginMutation()
    setIsMutating(true)
    try {
      setCart(await cartRequest(path, init))
      setMutationError(null)
    } catch (error) {
      if (error instanceof CartRequestError && isResettableCart(error.code)) {
        setCart(emptyCart)
        if (path === "/api/cart/items" && init.method === "POST") {
          try {
            setCart(await cartRequest(path, init))
            setMutationError(null)
            return
          } catch (retryError) {
            setMutationError(
              retryError instanceof Error ? retryError.message : "cart_unavailable",
            )
            return
          }
        }
      }
      setMutationError(error instanceof Error ? error.message : "cart_unavailable")
    } finally {
      refreshGuard.endMutation()
      mutationLock.current = false
      setIsMutating(false)
    }
  }, [refreshGuard])

  const clearCart = useCallback(async () => {
    if (mutationLock.current) {
      return
    }

    mutationLock.current = true
    refreshGuard.beginMutation()
    setIsMutating(true)
    try {
      let nextCart = cart
      for (const group of groupVisualCartLines(cart.items)) {
        const line = group.lines[0]
        if (!line) continue
        nextCart = await cartRequest(
          "/api/cart/items/" + encodeURIComponent(line.id),
          { method: "DELETE" },
        )
        setCart(nextCart)
      }
      setMutationError(null)
    } catch (error) {
      if (error instanceof CartRequestError && isResettableCart(error.code)) {
        setCart(emptyCart)
      }
      setMutationError(error instanceof Error ? error.message : "cart_unavailable")
    } finally {
      refreshGuard.endMutation()
      mutationLock.current = false
      setIsMutating(false)
    }
  }, [cart, refreshGuard])

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
