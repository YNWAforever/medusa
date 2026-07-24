import { describe, expect, it, vi } from "vitest"

import { republishStrandedPhotoUploads } from "./photo-upload-reconciliation"

describe("photo upload reconciliation", () => {
  it("republishes only uploaded assets older than the grace period", async () => {
    const now = new Date("2026-07-24T12:00:00.000Z")
    const service = {
      listPhotoAssets: vi.fn(async () => [
        { id: "asset_stale", status: "uploaded", updated_at: new Date(now.getTime() - 3 * 60 * 1000) },
        { id: "asset_fresh", status: "uploaded", updated_at: new Date(now.getTime() - 30 * 1000) },
      ]),
    }
    const eventBus = { emit: vi.fn(async () => undefined) }

    await expect(republishStrandedPhotoUploads({ service, eventBus, now }))
      .resolves.toEqual({ candidates: 2, republished: 1, failures: 0 })
    expect(eventBus.emit).toHaveBeenCalledWith({
      name: "photo_asset.uploaded",
      data: { asset_id: "asset_stale" },
    })
  })
})
