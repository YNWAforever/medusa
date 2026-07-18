import { describe, expect, it, vi } from "vitest"
import { DELETE } from "./[id]/assets/[assetId]/route"

function fixture(owner = "cus_1") {
  const asset = { id: "asset_1", job_id: "job_1", object_key: "private/key", status: "uploaded" }
  const service = {
    retrievePhotoJob: vi.fn(async () => ({ id: "job_1", customer_id: owner, status: "uploading" })),
    retrievePhotoAsset: vi.fn(async () => asset),
    listPhotoUploadSessions: vi.fn(async () => []),
    updatePhotoUploadSessions: vi.fn(),
    updatePhotoAssets: vi.fn(async () => [{ ...asset, status: "deleted" }]),
    withPhotoJobTransaction: vi.fn(async (callback) => callback({ transactionManager: {} })),
  }
  const storage = { abortMultipartUpload: vi.fn(), deletePrivateObjects: vi.fn(async () => undefined) }
  const req = { params: { id: "job_1", assetId: "asset_1" }, auth_context: { actor_id: "cus_1" }, headers: { get: () => null }, scope: { resolve: (name: string) => name.toLowerCase().includes("storage") ? storage : service } }
  const res = { json: vi.fn() }
  return { asset, service, storage, req, res }
}

describe("owned photo asset delete", () => {
  it("deletes private bytes and durably releases the asset", async () => {
    const { service, storage, req, res } = fixture()
    await DELETE(req, res)
    expect(storage.deletePrivateObjects).toHaveBeenCalledWith(["private/key"])
    expect(service.updatePhotoAssets).toHaveBeenCalledWith(expect.objectContaining({ selector: { id: "asset_1", status: "uploaded" }, data: expect.objectContaining({ status: "deleted" }) }), expect.anything())
    expect(res.json).toHaveBeenCalledWith({ asset: { id: "asset_1", status: "deleted" } })
  })

  it("conceals assets from another customer", async () => {
    const { req, res } = fixture("cus_other")
    await expect(DELETE(req, res)).rejects.toThrow("photo_job_not_found")
  })
})
