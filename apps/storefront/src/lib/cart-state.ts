import type { CatalogProduct } from "./medusa/contracts"

export interface CartItem {
  product: CatalogProduct
  quantity: number
}

export function addCartItem(items: CartItem[], product: CatalogProduct): CartItem[] {
  const existing = items.find((item) => item.product.handle === product.handle)

  return existing
    ? items.map((item) =>
        item.product.handle === product.handle
          ? { ...item, quantity: item.quantity + 1 }
          : item,
      )
    : [...items, { product, quantity: 1 }]
}

export function getCartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => {
    const variant = item.product.variants.find((candidate) => candidate.inventory.available)
      ?? item.product.variants[0]

    return sum + (variant?.price.amount ?? 0) * item.quantity
  }, 0)
}
