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

export interface VisualCartGroup {
  key: string
  kind: CartLineView["kind"]
  title: string
  quantity: number
  photoCount: number | null
  subtotal: CartLineView["subtotal"]
  lines: CartLineView[]
}

export function groupVisualCartLines(items: readonly CartLineView[]): VisualCartGroup[] {
  const groups = new Map<string, VisualCartGroup>()
  for (const item of items) {
    const isPhoto = item.kind === "photo_print" && Boolean(item.photoJobVersionId)
    const key = isPhoto ? `photo:${item.photoJobVersionId}` : `line:${item.id}`
    const current = groups.get(key)
    if (current) {
      current.lines.push(item)
      current.quantity += item.quantity
      current.subtotal.amount += item.subtotal.amount
      continue
    }
    groups.set(key, {
      key,
      kind: item.kind,
      title: isPhoto ? "Photo prints" : item.title,
      quantity: item.quantity,
      photoCount: isPhoto ? item.photoCount : null,
      subtotal: { ...item.subtotal },
      lines: [item],
    })
  }
  return [...groups.values()]
}