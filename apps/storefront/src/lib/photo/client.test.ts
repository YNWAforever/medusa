import { describe, expect, it, vi } from "vitest"
import { createPhotoClient } from "./client"

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