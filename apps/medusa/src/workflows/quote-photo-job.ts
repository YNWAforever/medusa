import { createHash } from "node:crypto"

export type QuoteStore = {
  retrieveVersion(id: string): Promise<any | null>
  listItems(filters: Record<string, unknown>): Promise<any[]>
  resolveVariantPrice(id: string): Promise<{ id: string; published: boolean; commerceMode: string; currencyCode: string; amount: number } | null>
  assertCapability(items: any[], fulfillment?: { type: "delivery" | "pickup"; branchId?: string }): Promise<void>
  commitQuote(input: Record<string, any>): Promise<void>
  createPriceChangedQuote(input: Record<string, any>): Promise<any>
}

function canonicalManifest(items: any[]) {
  return items
    .map((item) => ({
      assetId: item.asset_id,
      variantId: item.variant_id,
      sku: item.sku,
      finish: item.finish,
      border: item.border,
      cropMode: item.crop_mode,
      crop: item.crop,
      size: item.size ?? "4R",
      quantity: item.quantity,
      effectivePpi: item.effective_ppi,
      qualityBand: item.quality_band,
      warnings: [...(item.warnings ?? [])].sort(),
      warningAcknowledgements: [...(item.warning_acknowledgements ?? [])].sort(),
    }))
    .sort((left, right) => left.assetId.localeCompare(right.assetId))
}

export async function quotePhotoJob(
  input: { jobId: string; versionId: string; fulfillment?: { type: "delivery" | "pickup"; branchId?: string } },
  store: QuoteStore,
  now = new Date(),
) {
  if (Object.prototype.hasOwnProperty.call(input, "price")) {
    throw new Error("photo_client_price_forbidden")
  }
  const version = await store.retrieveVersion(input.versionId)
  if (!version || version.job_id !== input.jobId) throw new Error("photo_version_not_found")
  if (version.order_id) throw new Error("photo_order_conflict")
  const items = await store.listItems({ version_id: version.id })
  if (!items.length) throw new Error("photo_version_empty")
  await store.assertCapability(items, input.fulfillment)
  let subtotal = 0
  const snapshots: Array<{ id: string; unit_price_snapshot: number }> = []
  for (const item of items) {
    const variant = await store.resolveVariantPrice(item.variant_id)
    if (
      !variant
      || !variant.published
      || variant.commerceMode !== "photo_print"
      || variant.currencyCode.toLowerCase() !== "hkd"
      || !Number.isInteger(variant.amount)
      || variant.amount < 0
    ) throw new Error("photo_variant_unavailable")
    subtotal += variant.amount * item.quantity
    snapshots.push({ id: item.id, unit_price_snapshot: variant.amount })
  }
  const manifestDigest = createHash("sha256")
    .update(JSON.stringify(canonicalManifest(items)))
    .digest("hex")
  const quoteExpiresAt = new Date(now.getTime() + 15 * 60 * 1000)
  const existingExpiry = version.quote_expires_at
    ? new Date(version.quote_expires_at)
    : null
  if (version.status === "quoted" && existingExpiry && existingExpiry > now) {
    const unchanged = snapshots.every((snapshot) =>
      items.find((item) => item.id === snapshot.id)?.unit_price_snapshot
        === snapshot.unit_price_snapshot,
    )
    if (unchanged) {
      return {
        versionId: version.id,
        subtotal: version.subtotal,
        currencyCode: version.currency_code,
        quotedAt: new Date(version.quoted_at).toISOString(),
        quoteExpiresAt: existingExpiry.toISOString(),
        manifestDigest: version.manifest_digest,
      }
    }
    return store.createPriceChangedQuote({
      version,
      items,
      snapshots,
      subtotal,
      manifestDigest,
      quotedAt: now,
      quoteExpiresAt,
    })
  }
  await store.commitQuote({
    versionId: version.id,
    expectedStatus: version.status,
    snapshots,
    version: {
      status: "quoted",
      subtotal,
      currency_code: "hkd",
      quoted_at: now,
      quote_expires_at: quoteExpiresAt,
      manifest_digest: manifestDigest,
    },
  })
  return {
    versionId: version.id,
    subtotal,
    currencyCode: "hkd",
    quotedAt: now.toISOString(),
    quoteExpiresAt: quoteExpiresAt.toISOString(),
    manifestDigest,
  }
}
