import { describe, expect, it, vi } from "vitest"
import { handleAbort, handleComplete, handleCreateUpload, handleSignPart, type UploadOperations } from "./handlers"

const secret = "gqVvUs6_vDW0BsZO8B0Kjt6fKLsWbX8WGkzev2TI17Y"
const req = (body: unknown = {}, params: Record<string, string> = { id: "phjob_1" }) => ({ body, params, headers: { get: (name: string) => name === "x-fotomax-guest-token" ? secret : null } })
const res = () => ({ json: vi.fn() })
const asset = { id: "phast_1", job_id: "phjob_1", object_key: "photo-jobs/123e4567-e89b-12d3-a456-426614174000/originals/123e4567-e89b-12d3-a456-426614174001", expected_bytes: 12, reported_mime_type: "image/jpeg", detected_mime_type: "image/jpeg", status: "uploading" }
const session = { id: "phups_1", asset_id: "phast_1", source_idempotency_key: "idem", provider_upload_id: "provider-secret", part_size: 8388608, expected_bytes: 12, status: "active", expires_at: new Date(Date.now() + 60000) }

function ops(overrides: Partial<UploadOperations> = {}): UploadOperations {
  return {
    assertOwnedJob: vi.fn(async () => ({ id: "phjob_1" })), countAssets: vi.fn(async () => 0), sumExpectedBytes: vi.fn(async () => 0),
    findSessionByIdempotencyKey: vi.fn(async () => null), createAssetAndSession: vi.fn(async () => ({ asset, session })), findOwnedSession: vi.fn(async () => ({ asset, session })),
    completeSession: vi.fn(async () => ({ ...asset, status: "uploaded" })), abortSession: vi.fn(async () => ({ ...asset, status: "failed", failure_code: "retry" })),
    storage: { startMultipartUpload: vi.fn(async () => ({ uploadId: "provider-secret" })), signUploadPart: vi.fn(async () => ({ url: "https://upload", expiresAt: new Date(Date.now() + 60000).toISOString(), requiredHeaders: {} })), completeMultipartUpload: vi.fn(async () => ({ etag: "etag", checksumCRC32C: "hRHAOg==" })), abortMultipartUpload: vi.fn(), headPrivateObject: vi.fn(async () => ({ bytes: 12, contentType: "image/jpeg", checksumCRC32C: "hRHAOg==" })), deletePrivateObjects: vi.fn() },
    ...overrides,
  }
}
const createBody = { filename: "x.jpg", reportedMime: "image/jpeg", bytes: 12, sourceIdempotencyKey: "idem", signatureBase64: Buffer.from([0xff, 0xd8, 0xff]).toString("base64") }

describe("multipart upload handlers", () => {
  it("returns the existing session for a repeated create without provider identifiers", async () => {
    const response = res(); const existing = ops({ findSessionByIdempotencyKey: vi.fn(async () => ({ asset, session })) })
    await handleCreateUpload(req(createBody), response, existing)
    expect(response.json).toHaveBeenCalledWith({ upload: { assetId: "phast_1", sessionId: "phups_1", partSize: 8388608, status: "active", expiresAt: expect.any(String) } })
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain("provider-secret")
  })

  it("rejects a 501st asset and aggregate bytes over 10 GiB", async () => {
    await expect(handleCreateUpload(req(createBody), res(), ops({ countAssets: vi.fn(async () => 500) }))).rejects.toThrow("photo_asset_limit_exceeded")
    await expect(handleCreateUpload(req(createBody), res(), ops({ sumExpectedBytes: vi.fn(async () => 10 * 1024 ** 3) }))).rejects.toThrow("photo_job_bytes_exceeded")
  })

  it("signs only owned active non-expired parts within bounds", async () => {
    const response = res(); const operations = ops()
    await handleSignPart(req({ partNumber: 1, checksumCRC32C: "hRHAOg==" }, { id: "phjob_1", sessionId: "phups_1" }), response, operations)
    expect(operations.storage.signUploadPart).toHaveBeenCalledWith(expect.objectContaining({ uploadId: "provider-secret", partNumber: 1, checksumCRC32C: "hRHAOg==" }))
    await expect(handleSignPart(req({ partNumber: 0, checksumCRC32C: "hRHAOg==" }, { id: "phjob_1", sessionId: "phups_1" }), res(), operations)).rejects.toThrow("photo_upload_invalid_part")
    await expect(handleSignPart(req({ partNumber: 1, checksumCRC32C: "hRHAOg==" }, { id: "phjob_1", sessionId: "phups_1" }), res(), ops({ findOwnedSession: vi.fn(async () => ({ asset, session: { ...session, expires_at: new Date(0) } })) }))).rejects.toThrow("photo_upload_expired")
  })

  it("requires consecutive completion parts and matching stored metadata", async () => {
    const parts = [{ partNumber: 1, etag: "a", checksumCRC32C: "hRHAOg==" }, { partNumber: 3, etag: "b", checksumCRC32C: "hRHAOg==" }]
    await expect(handleComplete(req({ parts }, { id: "phjob_1", sessionId: "phups_1" }), res(), ops())).rejects.toThrow("photo_upload_invalid_parts")
    await expect(handleComplete(req({ parts: [parts[0]] }, { id: "phjob_1", sessionId: "phups_1" }), res(), ops({ storage: { ...ops().storage, headPrivateObject: vi.fn(async () => ({ bytes: 13, contentType: "image/jpeg", checksumCRC32C: "hRHAOg==" })) } }))).rejects.toThrow("photo_upload_size_mismatch")
  })

  it("makes repeated completion and abort idempotent", async () => {
    const completed = ops({ findOwnedSession: vi.fn(async () => ({ asset: { ...asset, status: "uploaded" }, session: { ...session, status: "completed" } })) }); const cr = res()
    await handleComplete(req({ parts: [] }, { id: "phjob_1", sessionId: "phups_1" }), cr, completed)
    expect(completed.storage.completeMultipartUpload).not.toHaveBeenCalled(); expect(cr.json).toHaveBeenCalledWith({ asset: expect.objectContaining({ status: "uploaded" }) })
    const aborted = ops({ findOwnedSession: vi.fn(async () => ({ asset: { ...asset, status: "failed" }, session: { ...session, status: "aborted" } })) }); const ar = res()
    await handleAbort(req({}, { id: "phjob_1", sessionId: "phups_1" }), ar, aborted)
    expect(aborted.storage.abortMultipartUpload).not.toHaveBeenCalled()
  })
})
