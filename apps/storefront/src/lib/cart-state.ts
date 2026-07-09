import type { Product } from "@fotomax/shared"

export interface CartItem {
  product: Product
  quantity: number
}

export function addCartItem(items: CartItem[], product: Product): CartItem[] {
  const existing = items.find((item) => item.product.handle === product.handle)

  if (!existing) {
    return [...items, { product, quantity: 1 }]
  }

  return items.map((item) =>
    item.product.handle === product.handle ? { ...item, quantity: item.quantity + 1 } : item,
  )
}

export function getCartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.product.priceCents * item.quantity, 0)
}
