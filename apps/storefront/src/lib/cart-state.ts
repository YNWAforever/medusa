import type { CartLineView, CartView } from "./medusa/contracts"

export type CartItem = CartLineView

export function getCartSubtotal(items: readonly CartLineView[]): number {
  return items.reduce((total, item) => total + item.subtotal.amount, 0)
}

export function groupCartLines(items: readonly CartLineView[]): Record<CartLineView["kind"], CartLineView[]> {
  return {
    retail: items.filter((item) => item.kind === "retail"),
    photo_print: items.filter((item) => item.kind === "photo_print"),
  }
}

export function cartItemCount(cart: CartView): number {
  return cart.items.reduce((total, item) => total + item.quantity, 0)
}
