import { describe, expect, it, vi } from "vitest"
import { projectUploadProxyPayload } from "../../../app/api/photo-jobs/upload-proxy"
import { createPhotoClient } from "./client"

vi.mock("server-only", () => ({}))

describe("photo version client", () => {
  it("creates an immutable version with a unique idempotency key", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ version: { id: "phver_1" }, items: [], jobRevision: 8 }), { status: 200, headers: { "content-type": "application/json" } }))
    const payload = { expectedRevision: 7, defaults: { finish: "glossy" } }

    await expect(createPhotoClient(fetcher as typeof fetch).createVersion("job_1", payload)).resolves.toMatchObject({ version: { id: "phver_1" }, jobRevision: 8 })
    expect(fetcher).toHaveBeenCalledWith("/api/photo-jobs/job_1/versions", expect.objectContaining({
      method: "POST",
      body: JSON.stringify(payload),
      headers: expect.objectContaining({ "idempotency-key": expect.any(String) }),
    }))
  })

  it("returns only the server-calculated quote body", async () => {
    const quote = { versionId: "phver_1", subtotal: 1800, currencyCode: "hkd", quotedAt: "2026-07-19T10:00:00.000Z", quoteExpiresAt: "2026-07-19T10:15:00.000Z", manifestDigest: "abc" }
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ quote }), { status: 200, headers: { "content-type": "application/json" } }))

    await expect(createPhotoClient(fetcher as typeof fetch).quoteVersion("job_1", "phver_1")).resolves.toEqual(quote)
    expect(fetcher).toHaveBeenCalledWith("/api/photo-jobs/job_1/quote", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ versionId: "phver_1" }),
    }))
  })
})

describe("photo upload client", () => {
  it("serializes single-PUT completion without its discriminator", async () => {
    const fetcher = vi.fn(async () => new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    }))

    await createPhotoClient(fetcher as typeof fetch).complete(
      "job_1",
      "session_1",
      { strategy: "single-put", etag: '"blob-etag"' },
    )

    expect(fetcher).toHaveBeenCalledWith(
      "/api/photo-jobs/job_1/uploads/session_1/complete",
      expect.objectContaining({
        body: JSON.stringify({ etag: '"blob-etag"' }),
      }),
    )
  })

  it("serializes multipart completion without its discriminator", async () => {
    const fetcher = vi.fn(async () => new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    }))
    const parts = [{ partNumber: 1, etag: "part-etag", checksumCRC32C: "crc" }]

    await createPhotoClient(fetcher as typeof fetch).complete(
      "job_1",
      "session_1",
      { strategy: "multipart", parts },
    )

    expect(fetcher).toHaveBeenCalledWith(
      "/api/photo-jobs/job_1/uploads/session_1/complete",
      expect.objectContaining({ body: JSON.stringify({ parts }) }),
    )
  })
})

describe("photo upload BFF projection", () => {
  it("allowlists a single-PUT session and strips provider data", () => {
    expect(projectUploadProxyPayload({
      upload: {
        assetId: "asset_1",
        sessionId: "session_1",
        strategy: "single-put",
        uploadUrl: "https://blob.invalid/signed",
        requiredHeaders: {
          "content-type": "image/jpeg",
          authorization: "Bearer provider-secret",
        },
        status: "active",
        expiresAt: "2026-07-26T10:00:00.000Z",
        BLOB_READ_WRITE_TOKEN: "provider-secret",
        providerInternal: "must-not-leak",
      },
      BLOB_READ_WRITE_TOKEN: "provider-secret",
    })).toEqual({
      upload: {
        assetId: "asset_1",
        sessionId: "session_1",
        strategy: "single-put",
        uploadUrl: "https://blob.invalid/signed",
        requiredHeaders: { "content-type": "image/jpeg" },
        status: "active",
        expiresAt: "2026-07-26T10:00:00.000Z",
      },
    })
  })

  it("adds the multipart discriminator to the legacy session shape", () => {
    expect(projectUploadProxyPayload({
      upload: {
        assetId: "asset_1",
        sessionId: "session_1",
        partSize: 6,
        status: "active",
        expiresAt: "2026-07-26T10:00:00.000Z",
      },
    })).toEqual({
      upload: {
        assetId: "asset_1",
        sessionId: "session_1",
        strategy: "multipart",
        partSize: 6,
        status: "active",
        expiresAt: "2026-07-26T10:00:00.000Z",
      },
    })
  })

  it.each([
    { strategy: "single-put", partSize: 6, uploadUrl: "https://blob.invalid/signed", requiredHeaders: {} },
    { strategy: "single-put", requiredHeaders: {} },
    { strategy: "multipart", partSize: 6, uploadUrl: "https://blob.invalid/signed" },
    { strategy: "multipart", partSize: 0 },
    { strategy: "unknown", partSize: 6 },
  ])("rejects malformed or ambiguous strategy payloads", (strategyFields) => {
    expect(() => projectUploadProxyPayload({
      upload: {
        assetId: "asset_1",
        sessionId: "session_1",
        status: "active",
        expiresAt: "2026-07-26T10:00:00.000Z",
        ...strategyFields,
      },
    })).toThrow("photo_job_unavailable")
  })
})
