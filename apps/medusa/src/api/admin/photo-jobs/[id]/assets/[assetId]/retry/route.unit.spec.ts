import { beforeEach, describe, expect, it, vi } from "vitest"

const { retryDeadLetteredPhotoAsset } = vi.hoisted(() => ({
  retryDeadLetteredPhotoAsset: vi.fn(),
}))

vi.mock("../../../../../../../modules/photo-production", () => ({
  PHOTO_PRODUCTION_MODULE: "photoProduction",
}))
vi.mock("../../../../../../../workflows/retry-photo-asset", () => ({
  retryDeadLetteredPhotoAsset,
}))

import { POST } from "./route"

function response() {
  return {
    json: vi.fn(),
    send: vi.fn(),
    status: vi.fn().mockReturnThis(),
  }
}

describe("POST admin photo asset retry", () => {
  beforeEach(() => {
    retryDeadLetteredPhotoAsset.mockReset()
  })

  it("passes the authenticated admin and job boundary to the retry workflow", async () => {
    const service = { name: "photo-service" }
    const eventBus = { name: "event-bus" }
    const scope = {
      resolve: vi.fn((key: string) =>
        key === "photoProduction" ? service : eventBus,
      ),
    }
    retryDeadLetteredPhotoAsset.mockResolvedValue({
      id: "asset_1",
      status: "processing",
    })
    const res = response()

    await POST(
      {
        auth_context: { actor_id: "admin_1" },
        headers: { "x-request-id": "request_1" },
        params: { id: "job_1", assetId: "asset_1" },
        scope,
      },
      res,
    )

    expect(retryDeadLetteredPhotoAsset).toHaveBeenCalledWith(
      {
        actorId: "admin_1",
        assetId: "asset_1",
        jobId: "job_1",
        requestId: "request_1",
      },
      { eventBus, service },
    )
    expect(res.json).toHaveBeenCalledWith({
      asset: { id: "asset_1", status: "processing" },
    })
  })

  it("rejects requests without an authenticated admin", async () => {
    const res = response()

    await POST(
      { params: { id: "job_1", assetId: "asset_1" } },
      res,
    )

    expect(res.status).toHaveBeenCalledWith(404)
    expect(retryDeadLetteredPhotoAsset).not.toHaveBeenCalled()
  })

  it("does not reveal whether a retry target exists", async () => {
    retryDeadLetteredPhotoAsset.mockRejectedValue(
      new Error("photo_asset_retry_unavailable"),
    )
    const res = response()

    await POST(
      {
        auth_context: { actor_id: "admin_1" },
        headers: {},
        params: { id: "job_1", assetId: "asset_1" },
        scope: { resolve: vi.fn(() => ({})) },
      },
      res,
    )

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.send).toHaveBeenCalled()
  })
})
