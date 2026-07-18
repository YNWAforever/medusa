import { describe, expect, it, vi } from "vitest"
import { PhotoClientError } from "./contracts"
import { crc32cBase64, MultipartUploader, restoreUploads, validateSelection } from "./uploader"

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 4, 5, 6, 7])
const file = new File([jpeg], "photo.jpg", { type: "image/jpeg" })

function client(overrides: Record<string, unknown> = {}) {
  return {
    createUpload: vi.fn(async () => ({ assetId: "asset_1", sessionId: "session_1", partSize: 6, status: "active", expiresAt: new Date(Date.now() + 1000).toISOString() })),
    signPart: vi.fn(async () => ({ url: "https://upload.invalid/part" })),
    complete: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
    getJob: vi.fn(),
    ...overrides,
  } as any
}

describe("MultipartUploader", () => {
  it("uploads consecutive checksummed parts and reports aggregate progress", async () => {
    const api = client()
    const put = vi.fn(async () => new Response(null, { status: 200, headers: { etag: "etag" } }))
    const progress: number[] = []
    await new MultipartUploader(api, put as any).upload("job_1", file, "source_1", (value) => progress.push(value.percent))
    expect(api.signPart.mock.calls.map((call: unknown[]) => call[2])).toEqual([1, 2])
    expect(api.complete).toHaveBeenCalledWith("job_1", "session_1", expect.arrayContaining([expect.objectContaining({ partNumber: 1 })]))
    expect(progress.at(-1)).toBe(100)
  })

  it("retries a transient part failure without creating another asset", async () => {
    const api = client()
    const put = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValue(new Response(null, { status: 200, headers: { etag: "etag" } }))
    await new MultipartUploader(api, put as any).upload("job_1", file, "stable-key")
    expect(api.createUpload).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledTimes(3)
  })

  it("aborts and replaces an expired session", async () => {
    const api = client({ signPart: vi.fn().mockRejectedValueOnce(new PhotoClientError("photo_upload_expired", 409)).mockResolvedValue({ url: "https://upload.invalid/part" }) })
    const put = vi.fn(async () => new Response(null, { status: 200, headers: { etag: "etag" } }))
    await new MultipartUploader(api, put as any).upload("job_1", file, "source")
    expect(api.abort).toHaveBeenCalledWith("job_1", "session_1")
    expect(api.createUpload).toHaveBeenCalledTimes(2)
  })

  it("rejects known limits before network calls", () => {
    expect(() => validateSelection(Array.from({ length: 501 }, () => file))).toThrow("photo_asset_limit_exceeded")
  })

  it("restores uploaded and failed placeholders", () => {
    expect(restoreUploads({ id: "job", locale: "en", revision: 1, status: "uploading", assets: [{ id: "a", display_name: "a.jpg", expected_bytes: 12, status: "uploaded" }] })).toEqual([{ id: "a", name: "a.jpg", bytes: 12, status: "uploaded" }])
  })

  it("computes the standard CRC32C value", () => {
    expect(crc32cBase64(new TextEncoder().encode("123456789"))).toBe("4waSgw==")
  })
})
