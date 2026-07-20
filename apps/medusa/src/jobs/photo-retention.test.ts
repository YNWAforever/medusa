import { describe, expect, it, vi } from "vitest"

import { runPhotoRetention } from "./photo-retention"

function fixture() {
  const now = new Date("2026-07-20T12:00:00.000Z")
  const job = { id: "job_1", status: "draft", retention_class: "standard", last_activity_at: new Date(now.getTime() - 168 * 60 * 60 * 1000) }
  const asset = { id: "asset_1", job_id: job.id, status: "ready", object_key: "photo-jobs/00000000-0000-4000-8000-000000000001/originals/00000000-0000-4000-8000-000000000002", preview_key: "photo-jobs/00000000-0000-4000-8000-000000000001/previews/00000000-0000-4000-8000-000000000002.jpg", sha256: "sha", crc32c: "crc", width: 1200, height: 1800 }
  const service: any = {
    listPhotoJobs: vi.fn(async () => [job]),
    listPhotoAssets: vi.fn(async () => [asset]),
    updatePhotoAssets: vi.fn(async (input) => [{ ...asset, ...input.data }]),
    updatePhotoJobs: vi.fn(async (input) => [{ ...job, ...input.data }]),
  }
  const storage: any = {
    deletePrivateObjects: vi.fn(async () => undefined),
    headPrivateObject: vi.fn(async () => { throw new Error("photo_storage_not_found") }),
  }
  const locking = { execute: vi.fn(async (_keys: string[], action: () => Promise<unknown>) => action()) }
  const eventBus = { emit: vi.fn(async () => undefined) }
  const logger = { info: vi.fn(), warn: vi.fn() }
  return { now, job, asset, service, storage, locking, eventBus, logger }
}

describe("hourly photo retention cleanup", () => {
  it("locks, deletes and verifies both keys, then preserves evidence-only asset fields", async () => {
    const f = fixture()
    await expect(runPhotoRetention({ ...f, batchSize: 25 })).resolves.toEqual({ expiredJobs: 1, deletedAssets: 1, failures: 0 })
    expect(f.locking.execute).toHaveBeenCalledWith(["photo-retention:job_1"], expect.any(Function))
    expect(f.storage.deletePrivateObjects).toHaveBeenCalledWith([f.asset.object_key, f.asset.preview_key])
    expect(f.storage.headPrivateObject).toHaveBeenCalledTimes(2)
    expect(f.service.updatePhotoAssets).toHaveBeenCalledWith(expect.objectContaining({
      selector: { id: "asset_1" },
      data: expect.objectContaining({ status: "deleted", object_key: null, preview_key: null, media_deleted_at: f.now }),
    }))
    expect(f.service.updatePhotoJobs).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "expired", expired_at: f.now }) }))
    expect(f.eventBus.emit).toHaveBeenCalledWith({ name: "photo_retention.deleted", data: { job_id: "job_1", deleted_at: f.now.toISOString(), asset_count: 1, object_count: 2 } })
    expect(JSON.stringify(f.eventBus.emit.mock.calls)).not.toContain("object_key")
  })

  it("is idempotent when no eligible jobs remain and bounds candidate selection", async () => {
    const f = fixture()
    f.service.listPhotoJobs.mockResolvedValue([])
    await expect(runPhotoRetention({ ...f, batchSize: 7 })).resolves.toEqual({ expiredJobs: 0, deletedAssets: 0, failures: 0 })
    expect(f.service.listPhotoJobs).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ take: 7 }))
    expect(f.storage.deletePrivateObjects).not.toHaveBeenCalled()
  })

  it("does not mark deletion complete until every object is verified absent", async () => {
    const f = fixture()
    f.storage.headPrivateObject.mockResolvedValue({ bytes: 1, contentType: "image/jpeg", checksumCRC32C: "crc" })
    await expect(runPhotoRetention(f)).resolves.toMatchObject({ failures: 1, expiredJobs: 0 })
    expect(f.service.updatePhotoAssets).not.toHaveBeenCalled()
    expect(f.service.updatePhotoJobs).not.toHaveBeenCalled()
  })
})
