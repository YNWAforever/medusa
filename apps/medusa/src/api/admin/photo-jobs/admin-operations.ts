const ACCESS_REASONS = new Set(["quality_check", "production", "support"])

export const PRODUCTION_STATUSES = [
  "accepted", "processing", "ready", "in_production", "ready_for_pickup",
  "shipped", "fulfilled", "failed", "cancelled",
] as const
export type ProductionStatus = typeof PRODUCTION_STATUSES[number]

const transitions: Record<ProductionStatus, readonly ProductionStatus[]> = {
  accepted: ["processing", "cancelled"],
  processing: ["ready", "failed", "cancelled"],
  ready: ["in_production", "cancelled"],
  in_production: ["ready_for_pickup", "shipped", "failed", "cancelled"],
  ready_for_pickup: ["fulfilled", "cancelled"],
  shipped: ["fulfilled", "failed"],
  fulfilled: [],
  failed: ["processing", "cancelled"],
  cancelled: [],
}

export function assertAdminActor(context?: { actor_id?: string | null; actor_type?: string | null }): string {
  const id = context?.actor_id?.trim()
  if (!id || !["user", "admin"].includes(context?.actor_type ?? "")) {
    throw new Error("photo_admin_unauthorized")
  }
  return id
}

export function transitionProductionStatus(current: string, next: string): ProductionStatus {
  if (!PRODUCTION_STATUSES.includes(current as ProductionStatus)
    || !PRODUCTION_STATUSES.includes(next as ProductionStatus)
    || !transitions[current as ProductionStatus].includes(next as ProductionStatus)) {
    throw new Error("photo_production_transition_invalid")
  }
  return next as ProductionStatus
}

export function buildProductionManifest(
  job: { id: string },
  version: { id: string; order_id?: string | null; manifest_digest?: string | null },
  assets: Array<{ id: string; width?: number | null; height?: number | null }>,
  items: Array<Record<string, any>>,
) {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]))
  return {
    jobId: job.id,
    versionId: version.id,
    orderId: version.order_id ?? null,
    manifestDigest: version.manifest_digest ?? null,
    items: items.map((item) => {
      const asset = assetsById.get(item.asset_id)
      return {
        assetId: item.asset_id,
        width: asset?.width ?? null,
        height: asset?.height ?? null,
        crop: item.crop,
        size: item.size,
        finish: item.finish,
        border: item.border,
        quantity: item.quantity,
        qualityAcknowledgements: item.warning_acknowledgements ?? [],
      }
    }),
  }
}

export async function requestAuditedAssetAccess(
  input: { jobId: string; assetId: string; actorId: string; reason: string; requestId?: string },
  dependencies: { service: any; storage: any },
) {
  if (!ACCESS_REASONS.has(input.reason)) throw new Error("photo_access_reason_invalid")
  let asset: any
  try { asset = await dependencies.service.retrievePhotoAsset(input.assetId) } catch {
    throw new Error("photo_asset_not_found")
  }
  if (!asset || asset.job_id !== input.jobId || !asset.object_key || asset.status === "deleted") {
    throw new Error("photo_asset_not_found")
  }
  await dependencies.service.createPhotoAssetAccessAudits({
    asset_id: asset.id,
    actor_id: input.actorId,
    actor_type: "admin",
    action: "read_original",
    reason: input.reason,
    request_id: input.requestId ?? null,
  })
  return dependencies.storage.signPrivateOriginalRead(asset.object_key, 300)
}

export async function validateBranchCapabilityUpdate(
  input: { supportedPrintSkus: unknown; leadTimeBusinessDays: unknown; pickupEnabled: unknown },
  resolveSku: (sku: string) => Promise<{ sku: string; published: boolean; commerceMode: string } | null>,
) {
  if (!Number.isInteger(input.leadTimeBusinessDays)
    || Number(input.leadTimeBusinessDays) < 1
    || Number(input.leadTimeBusinessDays) > 30) {
    throw new Error("photo_capability_lead_time_invalid")
  }
  if (!Array.isArray(input.supportedPrintSkus)
    || !input.supportedPrintSkus.length
    || input.supportedPrintSkus.some((sku) => typeof sku !== "string" || !sku.trim())) {
    throw new Error("photo_capability_sku_invalid")
  }
  const skus = [...new Set(input.supportedPrintSkus.map((sku) => String(sku).trim()))]
  for (const sku of skus) {
    const variant = await resolveSku(sku)
    if (!variant?.published || variant.commerceMode !== "photo_print") {
      throw new Error("photo_capability_sku_invalid")
    }
  }
  if (typeof input.pickupEnabled !== "boolean") throw new Error("photo_capability_pickup_invalid")
  return {
    supported_print_skus: skus,
    lead_time_business_days: Number(input.leadTimeBusinessDays),
    pickup_enabled: input.pickupEnabled,
  }
}
