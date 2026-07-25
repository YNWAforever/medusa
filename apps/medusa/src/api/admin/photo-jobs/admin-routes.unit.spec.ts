import { describe, expect, it, vi } from "vitest"

import {
  assertAdminActor,
  buildProductionManifest,
  requestAuditedAssetAccess,
  transitionProductionStatus,
  validateBranchCapabilityUpdate,
} from "./admin-operations"

describe("photo production Admin operations", () => {
  it("rejects missing and Store actors", () => {
    expect(() => assertAdminActor(undefined)).toThrow("photo_admin_unauthorized")
    expect(() => assertAdminActor({ actor_id: "cus_1", actor_type: "customer" })).toThrow("photo_admin_unauthorized")
    expect(assertAdminActor({ actor_id: "user_1", actor_type: "user" })).toBe("user_1")
  })

  it("builds a URL-free immutable production manifest", () => {
    const manifest = buildProductionManifest({ id: "job_1" }, { id: "version_1", order_id: "order_1", manifest_digest: "digest" }, [{ id: "asset_1", width: 1200, height: 1800 }], [{ asset_id: "asset_1", crop: { x: 0, y: 0, width: 1, height: 1 }, size: "4R", finish: "glossy", border: "none", quantity: 2, warning_acknowledgements: ["low_ppi"] }])
    expect(manifest).toMatchObject({ jobId: "job_1", versionId: "version_1", orderId: "order_1", manifestDigest: "digest", items: [{ assetId: "asset_1", width: 1200, height: 1800, size: "4R", finish: "glossy", quantity: 2 }] })
    expect(JSON.stringify(manifest)).not.toMatch(/url|object_key|preview_key/i)
  })

  it("requires an approved reason, same-job asset, audit write, and at most 300 seconds", async () => {
    const service: any = { retrievePhotoAsset: vi.fn(async () => ({ id: "asset_1", job_id: "job_1", object_key: "private-key", storage_provider: "vercel-blob" })), createPhotoAssetAccessAudits: vi.fn(async () => ({})) }
    const signRead = vi.fn(async () => ({ url: "https://signed.test", expiresAt: "2026-07-20T00:05:00.000Z" }))
    const storage: any = { signRead }
    await expect(requestAuditedAssetAccess({ jobId: "job_1", assetId: "asset_1", actorId: "user_1", reason: "production", requestId: "req_1" }, { service, storage })).resolves.toMatchObject({ url: "https://signed.test" })
    expect(storage.signRead).toHaveBeenCalledWith({ provider: "vercel-blob", key: "private-key" }, 300)
    expect(service.createPhotoAssetAccessAudits).toHaveBeenCalledWith(expect.objectContaining({ actor_id: "user_1", reason: "production", action: "read_original" }))
    await expect(requestAuditedAssetAccess({ jobId: "job_1", assetId: "asset_1", actorId: "user_1", reason: "curiosity" }, { service, storage })).rejects.toThrow("photo_access_reason_invalid")
    service.retrievePhotoAsset.mockResolvedValue({ id: "asset_1", job_id: "job_2", object_key: "private-key" })
    await expect(requestAuditedAssetAccess({ jobId: "job_1", assetId: "asset_1", actorId: "user_1", reason: "quality_check" }, { service, storage })).rejects.toThrow("photo_asset_not_found")
  })

  it("guards production status transitions and transient-only retries", () => {
    expect(transitionProductionStatus("accepted", "processing")).toBe("processing")
    expect(() => transitionProductionStatus("fulfilled", "processing")).toThrow("photo_production_transition_invalid")
  })

  it("accepts only published photo-print SKUs and lead times from one to thirty days", async () => {
    const resolveSku = vi.fn(async (sku: string) => ({ sku, published: true, commerceMode: sku === "4R-GLOSSY" ? "photo_print" : "retail" }))
    await expect(validateBranchCapabilityUpdate({ supportedPrintSkus: ["4R-GLOSSY"], leadTimeBusinessDays: 2, pickupEnabled: true }, resolveSku)).resolves.toEqual({ supported_print_skus: ["4R-GLOSSY"], lead_time_business_days: 2, pickup_enabled: true })
    await expect(validateBranchCapabilityUpdate({ supportedPrintSkus: ["FILM"], leadTimeBusinessDays: 2, pickupEnabled: true }, resolveSku)).rejects.toThrow("photo_capability_sku_invalid")
    await expect(validateBranchCapabilityUpdate({ supportedPrintSkus: ["4R-GLOSSY"], leadTimeBusinessDays: 0, pickupEnabled: true }, resolveSku)).rejects.toThrow("photo_capability_lead_time_invalid")
  })
})
