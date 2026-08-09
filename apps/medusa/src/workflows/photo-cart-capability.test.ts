import { describe, expect, it, vi } from "vitest"

import { assertSelectedPhotoCapability } from "./photo-cart-runtime"

describe("selected photo fulfillment capability", () => {
  it("rejects an unsupported pickup option selected after quoting", async () => {
    await expect(assertSelectedPhotoCapability(
      { id: "cart_1", shipping_methods: [{ shipping_option_id: "so_pickup" }] },
      [{ id: "item_1", variant_id: "variant_1", quantity: 1, sku: "PHOTO-4R" }],
      {
        resolveShippingOption: vi.fn(async () => ({
          data: { fulfillment_kind: "pickup", branch_handle: "central" },
        })),
        resolveBranch: vi.fn(async () => ({
          pickup_enabled: true,
          test_only: true,
          supported_print_skus: ["OTHER-SKU"],
        })),
      },
    )).rejects.toThrow("photo_capability_unavailable")
  })

  it("allows delivery without a branch lookup", async () => {
    const resolveBranch = vi.fn()
    await expect(assertSelectedPhotoCapability(
      { id: "cart_1", shipping_methods: [{ shipping_option_id: "so_delivery" }] },
      [{ id: "item_1", variant_id: "variant_1", quantity: 1, sku: "PHOTO-4R" }],
      {
        resolveShippingOption: vi.fn(async () => ({
          metadata: { fulfillment_kind: "delivery" },
        })),
        resolveBranch,
      },
    )).resolves.toBeUndefined()
    expect(resolveBranch).not.toHaveBeenCalled()
  })
})
