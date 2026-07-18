import { describe, expect, it, vi } from "vitest"
import { runPhotoUploadCleanup } from "./photo-upload-cleanup"
function fixture() {
  const asset = { id: "asset_1", job_id: "job_1", object_key: "private/random", display_name: "secret-name.jpg", status: "uploading" }
  const session = { id: "session_1", asset_id: asset.id, provider_upload_id: "provider-secret", status: "active" }
  const service: Record<string, any> = { listPhotoUploadSessions: vi.fn(async (filters) => filters.status === "active" ? [session] : []), retrievePhotoAsset: vi.fn(async () => asset), updatePhotoUploadSessions: vi.fn(async () => [{ ...session, status: "expired" }]), updatePhotoAssets: vi.fn(async (input) => [{ ...asset, ...input.data }]), listPhotoJobs: vi.fn(async () => []), listPhotoAssets: vi.fn(async () => []) }
  const storage: Record<string, any> = { abortMultipartUpload: vi.fn(async () => undefined), deletePrivateObjects: vi.fn(async () => undefined) }
  const messages: string[] = []; const logger = { info: vi.fn((message) => messages.push(message)), warn: vi.fn((message) => messages.push(message)) }
  return { asset, session, service, storage, logger, messages }
}
describe("photo upload cleanup", () => {
  it("expires active sessions only after provider abort succeeds", async () => { const f = fixture(); await expect(runPhotoUploadCleanup(f)).resolves.toMatchObject({ expiredSessions: 1 }); expect(f.storage.abortMultipartUpload).toHaveBeenCalled(); expect(f.service.updatePhotoUploadSessions).toHaveBeenCalledWith(expect.objectContaining({ selector: { id: "session_1", status: "active" } })) })
  it("leaves provider failures retryable", async () => { const f = fixture(); f.storage.abortMultipartUpload.mockRejectedValue(new Error("provider unavailable")); await expect(runPhotoUploadCleanup(f)).resolves.toMatchObject({ failures: 1 }); expect(f.service.updatePhotoUploadSessions).not.toHaveBeenCalled() })
  it("deletes objects for cancelled jobs and marks assets deleted", async () => { const f = fixture(); f.service.listPhotoUploadSessions.mockResolvedValue([]); f.service.listPhotoJobs.mockResolvedValue([{ id: "job_1", status: "cancelled" }]); f.service.listPhotoAssets.mockResolvedValue([f.asset]); await expect(runPhotoUploadCleanup(f)).resolves.toMatchObject({ deletedAssets: 1 }); expect(f.storage.deletePrivateObjects).toHaveBeenCalledWith(["private/random"]); expect(f.service.updatePhotoAssets).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "deleted" }) })) })
  it("retries provider cleanup for already-deleted assets", async () => { const f = fixture(); f.service.listPhotoUploadSessions.mockResolvedValue([]); f.service.listPhotoAssets.mockResolvedValue([{ ...f.asset, status: "deleted" }]); await runPhotoUploadCleanup(f); await runPhotoUploadCleanup(f); expect(f.storage.deletePrivateObjects).toHaveBeenCalledTimes(2) })
  it("never logs filenames, credentials, signed URLs, or byte content", async () => { const f = fixture(); await runPhotoUploadCleanup(f); const output = f.messages.join("\n"); expect(output).toContain("session_id=session_1"); expect(output).not.toContain("secret-name.jpg"); expect(output).not.toContain("provider-secret"); expect(output).not.toMatch(/https?:|credential|bytes=/i) })
})
