import { describe, expect, it, vi } from "vitest"
import { createPhotoJobVersion } from "./create-photo-job-version"

const defaults = {
  finish: "glossy" as const,
  border: "none" as const,
  cropMode: "fill" as const,
  crop: { x: 0, y: 0, width: 1, height: 1 },
  quantity: 1,
}

function fixture() {
  const job = { id: "job_1", revision: 2, currency_code: "hkd", status: "ready" }
  const assets = [
    { id: "asset_1", job_id: "job_1", status: "ready", width: 1800, height: 1200, orientation: 1 },
    { id: "asset_2", job_id: "job_1", status: "ready", width: 1200, height: 800, orientation: 1 },
  ]
  const version = { id: "version_1", job_id: "job_1", sequence: 1, source_revision: 2 }
  const store = {
    transaction: vi.fn(async (callback: (value: any) => Promise<any>) => callback(store)),
    findVersionByIdempotency: vi.fn(async () => null),
    retrieveJob: vi.fn(async () => job),
    listAssets: vi.fn(async () => assets),
    listVersions: vi.fn(async () => []),
    createVersion: vi.fn(async () => version),
    createItems: vi.fn(async (items: any[]) => items.map((item, index) => ({ id: `item_${index + 1}`, ...item }))),
    updateJob: vi.fn(async () => ({ ...job, revision: 3, active_version_id: "version_1" })),
    resolveFinishVariant: vi.fn(async (finish: string) => ({
      id: finish === "glossy" ? "variant_glossy" : "variant_matte",
      sku: finish === "glossy" ? "4R-GLOSSY" : "4R-MATTE",
      published: true,
      commerceMode: "photo_print",
    })),
  }
  return { job, assets, version, store }
}

describe("createPhotoJobVersion", () => {
  it("creates one immutable item per ready asset and advances the job revision", async () => {
    const f = fixture()
    const result = await createPhotoJobVersion(
      {
        jobId: "job_1",
        idempotencyKey: "request_1",
        expectedRevision: 2,
        defaults,
        overrides: [{ assetId: "asset_2", settings: { finish: "matte" } }],
        warningAcknowledgements: [{ assetId: "asset_2", code: "quality_caution" }],
      },
      f.store,
    )

    expect(result.version).toEqual(f.version)
    expect(f.store.createItems).toHaveBeenCalledWith([
      expect.objectContaining({ asset_id: "asset_1", variant_id: "variant_glossy", quality_band: "good" }),
      expect.objectContaining({ asset_id: "asset_2", variant_id: "variant_matte", quality_band: "caution" }),
    ])
    expect(f.store.updateJob).toHaveBeenCalledWith(
      { id: "job_1", revision: 2 },
      expect.objectContaining({ active_version_id: "version_1", revision: 3 }),
    )
  })

  it("returns the existing version for a repeated idempotency key", async () => {
    const f = fixture()
    f.store.findVersionByIdempotency.mockResolvedValue({ version: f.version, items: [{ id: "item_1" }] })

    const result = await createPhotoJobVersion(
      { jobId: "job_1", idempotencyKey: "request_1", expectedRevision: 1, defaults, overrides: [], warningAcknowledgements: [] },
      f.store,
    )

    expect(result.version).toEqual(f.version)
    expect(f.store.createVersion).not.toHaveBeenCalled()
  })

  it("rejects stale revisions and non-ready assets", async () => {
    const f = fixture()
    await expect(createPhotoJobVersion(
      { jobId: "job_1", idempotencyKey: "request_1", expectedRevision: 1, defaults, overrides: [], warningAcknowledgements: [] },
      f.store,
    )).rejects.toThrow("photo_job_conflict")

    f.store.retrieveJob.mockResolvedValue({ ...f.job, revision: 2 })
    f.store.listAssets.mockResolvedValue([{ ...f.assets[0], status: "processing" }])
    await expect(createPhotoJobVersion(
      { jobId: "job_1", idempotencyKey: "request_2", expectedRevision: 2, defaults, overrides: [], warningAcknowledgements: [] },
      f.store,
    )).rejects.toThrow("photo_assets_not_ready")
  })

  it("rejects missing warning acknowledgement and unpublished variants", async () => {
    const f = fixture()
    await expect(createPhotoJobVersion(
      { jobId: "job_1", idempotencyKey: "request_1", expectedRevision: 2, defaults, overrides: [], warningAcknowledgements: [] },
      f.store,
    )).rejects.toThrow("photo_warning_acknowledgement_required")

    f.store.listAssets.mockResolvedValue([f.assets[0]])
    f.store.resolveFinishVariant.mockResolvedValue({ id: "variant_1", sku: "4R", published: false, commerceMode: "photo_print" })
    await expect(createPhotoJobVersion(
      { jobId: "job_1", idempotencyKey: "request_2", expectedRevision: 2, defaults, overrides: [], warningAcknowledgements: [] },
      f.store,
    )).rejects.toThrow("photo_finish_unavailable")
  })
})
