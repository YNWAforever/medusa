import type { CartLineView, CartView } from "./medusa/contracts"

export type CartItem = CartLineView

interface VersionRef {
  current: number
}

export function createCartRefreshGuard(version: VersionRef = { current: 0 }) {
  let mutationActive = false

  return {
    capture: () => version.current,
    invalidate() {
      version.current += 1
    },
    beginMutation() {
      version.current += 1
      mutationActive = true
    },
    endMutation() {
      mutationActive = false
    },
    canRefresh: () => !mutationActive,
    isCurrent: (candidate: number) => candidate === version.current,
  }
}

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
