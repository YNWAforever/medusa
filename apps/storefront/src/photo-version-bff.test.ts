import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { POST as createVersion } from "../app/api/photo-jobs/[jobId]/versions/route"
import { POST as quoteVersion } from "../app/api/photo-jobs/[jobId]/quote/route"

vi.mock("server-only", () => ({}))

describe("photo version BFF", () => {
  beforeEach(() => {
    process.env.MEDUSA_BACKEND_URL = "https://medusa.test"
    process.env.MEDUSA_PUBLISHABLE_KEY = "pk_test"
    process.env.STOREFRONT_ORIGIN = "https://storefront.test"
    process.env.STOREFRONT_SESSION_SECRET = "test-secret"
    vi.restoreAllMocks()
  })

  it("forwards version creation with idempotency and no-store", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ version: { id: "version_1" } })))
    const request = new NextRequest("https://storefront.test/api/photo-jobs/job_1/versions", {
      method: "POST",
      headers: { origin: "https://storefront.test", "content-type": "application/json", "idempotency-key": "request_1" },
      body: JSON.stringify({ expectedRevision: 2 }),
    })
    const response = await createVersion(request, { params: Promise.resolve({ jobId: "job_1" }) })
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init?.headers).toEqual(expect.objectContaining({ "idempotency-key": "request_1" }))
  })

  it("rejects a cross-origin quote without contacting Medusa", async () => {
    vi.stubGlobal("fetch", vi.fn())
    const request = new NextRequest("https://storefront.test/api/photo-jobs/job_1/quote", {
      method: "POST",
      headers: { origin: "https://evil.test", "content-type": "application/json" },
      body: JSON.stringify({ versionId: "version_1" }),
    })
    const response = await quoteVersion(request, { params: Promise.resolve({ jobId: "job_1" }) })
    expect(response.status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })
})
