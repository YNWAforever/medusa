import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { groupVisualCartLines } from "./cart-state"
import { projectCart } from "./medusa/cart"
import type { CartLineView } from "./medusa/contracts"
import { createPhotoClient } from "./photo/client"
import { createEditorState } from "../components/photo-editor/editor-state"

const photoLine = (id: string, variantId: string, subtotal: number): CartLineView => ({
  id,
  kind: "photo_print",
  variantId,
  title: variantId,
  thumbnail: null,
  quantity: 2,
  unitPrice: { amount: subtotal / 2, currencyCode: "hkd" },
  subtotal: { amount: subtotal, currencyCode: "hkd" },
  photoJobId: "job_1",
  photoJobVersionId: "version_1",
  photoCount: 4,
})

describe("Task 8 photo cart storefront contracts", () => {
  it("groups variant lines visually while preserving their summed subtotal", () => {
    const groups = groupVisualCartLines([
      photoLine("line_glossy", "variant_glossy", 600),
      photoLine("line_matte", "variant_matte", 800),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      key: "photo:version_1",
      kind: "photo_print",
      photoCount: 4,
      subtotal: { amount: 1400, currencyCode: "hkd" },
    })
    expect(groups[0]?.lines).toHaveLength(2)
  })

  it("projects the owner-safe job id needed to detach a photo group", () => {
    const cart = projectCart({
      id: "cart_1",
      currency_code: "hkd",
      items: [{
        id: "line_1", variant_id: "variant_1", title: "Glossy", quantity: 2,
        unit_price: 3, subtotal: 6,
        metadata: { kind: "photo_print", photo_job_id: "job_1", photo_job_version_id: "version_1", photo_item_count: 2 },
        variant: { product: { metadata: { commerce_mode: "photo_print" } } },
      }],
      subtotal: 6, shipping_total: 0, tax_total: 0, total: 6,
    })
    expect(cart.items[0]).toMatchObject({ photoJobId: "job_1", photoJobVersionId: "version_1" })
  })

  it("attaches a quoted job through the same-origin BFF", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ cart: { id: "cart_1" } }), { status: 200 }))
    await createPhotoClient(fetcher as typeof fetch).attachToCart("job_1")
    expect(fetcher).toHaveBeenCalledWith("/api/photo-jobs/job_1/cart", expect.objectContaining({ method: "POST" }))
  })

  it("freezes the editor for an ordered job", () => {
    expect(createEditorState({ id: "job_1", locale: "en", status: "ordered", revision: 4 }).readOnly).toBe(true)
  })
})
