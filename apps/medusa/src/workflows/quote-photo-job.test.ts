import { describe, expect, it, vi } from "vitest"
import { quotePhotoJob } from "./quote-photo-job"

function fixture() {
  const version = { id: "version_1", job_id: "job_1", status: "draft", currency_code: "hkd", quoted_at: null, quote_expires_at: null }
  const items = [
    { id: "item_1", asset_id: "asset_1", variant_id: "variant_1", sku: "4R-GLOSSY", finish: "glossy", border: "none", crop_mode: "fill", crop: { x: 0, y: 0, width: 1, height: 1 }, quantity: 2, unit_price_snapshot: null },
    { id: "item_2", asset_id: "asset_2", variant_id: "variant_2", sku: "4R-MATTE", finish: "matte", border: "white", crop_mode: "fit", crop: { x: 0, y: 0, width: 1, height: 1 }, quantity: 1, unit_price_snapshot: null },
  ]
  const store = {
    retrieveVersion: vi.fn(async () => version),
    listItems: vi.fn(async () => items),
    resolveVariantPrice: vi.fn(async (id: string) => ({ id, published: true, commerceMode: "photo_print", currencyCode: "hkd", amount: id === "variant_1" ? 250 : 300 })),
    assertCapability: vi.fn(async () => undefined),
    updateItems: vi.fn(async (updates: any[]) => updates),
    commitQuote: vi.fn(async () => undefined),
    updateVersion: vi.fn(async (_id: string, data: any) => ({ ...version, ...data })),
    createPriceChangedQuote: vi.fn(async () => ({ versionId: "version_2", subtotal: 800, currencyCode: "hkd", requiresReview: true })),
  }
  return { version, items, store }
}

describe("quotePhotoJob", () => {
  it("calculates an authoritative subtotal and stable manifest digest", async () => {
    const f = fixture()
    const now = new Date("2026-07-19T00:00:00.000Z")
    const result = await quotePhotoJob({ jobId: "job_1", versionId: "version_1" }, f.store, now)

    expect(result.subtotal).toBe(800)
    expect(result.currencyCode).toBe("hkd")
    expect(result.quoteExpiresAt).toBe("2026-07-19T00:15:00.000Z")
    expect(result.manifestDigest).toMatch(/^[a-f0-9]{64}$/)
expect(f.store.commitQuote).toHaveBeenCalledWith(expect.objectContaining({
      versionId: "version_1",
      snapshots: [
        { id: "item_1", unit_price_snapshot: 250 },
        { id: "item_2", unit_price_snapshot: 300 },
      ],
      version: expect.objectContaining({ subtotal: 800, status: "quoted" }),
    }))
  })

  it("reuses an unexpired quote when live prices are unchanged", async () => {
    const f = fixture()
    f.store.retrieveVersion.mockResolvedValue({
      ...f.version,
      status: "quoted",
      subtotal: 800,
      quoted_at: new Date("2026-07-19T00:00:00.000Z"),
      quote_expires_at: new Date("2026-07-19T00:15:00.000Z"),
      manifest_digest: "digest_1",
    })
    f.store.listItems.mockResolvedValue(f.items.map((item, index) => ({
      ...item,
      unit_price_snapshot: index === 0 ? 250 : 300,
    })))

    const result = await quotePhotoJob(
      { jobId: "job_1", versionId: "version_1" },
      f.store,
      new Date("2026-07-19T00:05:00.000Z"),
    )

    expect(result).toMatchObject({ versionId: "version_1", subtotal: 800 })
    expect(f.store.updateVersion).not.toHaveBeenCalled()
  })

  it("creates a replacement quote for review when a live price changed", async () => {
    const f = fixture()
    f.store.retrieveVersion.mockResolvedValue({
      ...f.version,
      status: "quoted",
      subtotal: 700,
      quoted_at: new Date("2026-07-19T00:00:00.000Z"),
      quote_expires_at: new Date("2026-07-19T00:15:00.000Z"),
    })
    f.store.listItems.mockResolvedValue(f.items.map((item) => ({
      ...item,
      unit_price_snapshot: 200,
    })))

    await expect(quotePhotoJob(
      { jobId: "job_1", versionId: "version_1" },
      f.store,
      new Date("2026-07-19T00:05:00.000Z"),
    )).resolves.toMatchObject({ versionId: "version_2", requiresReview: true })
    expect(f.store.createPriceChangedQuote).toHaveBeenCalled()
  })
+  it("rejects client prices, unavailable variants, and unsupported capability", async () => {
    const f = fixture()
    await expect(quotePhotoJob({ jobId: "job_1", versionId: "version_1", price: 1 } as any, f.store)).rejects.toThrow("photo_client_price_forbidden")
    f.store.resolveVariantPrice.mockResolvedValue({ id: "variant_1", published: false, commerceMode: "photo_print", currencyCode: "hkd", amount: 250 })
    await expect(quotePhotoJob({ jobId: "job_1", versionId: "version_1" }, f.store)).rejects.toThrow("photo_variant_unavailable")
    f.store.resolveVariantPrice.mockResolvedValue({ id: "variant_1", published: true, commerceMode: "photo_print", currencyCode: "hkd", amount: 250 })
    f.store.assertCapability.mockRejectedValue(new Error("photo_capability_unavailable"))
    await expect(quotePhotoJob({ jobId: "job_1", versionId: "version_1" }, f.store)).rejects.toThrow("photo_capability_unavailable")
  })
})
