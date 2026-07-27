import { describe, expect, it, vi } from "vitest"
import { handleCreateVersion, handleQuoteVersion } from "./version-handlers"

function response() {
  return { json: vi.fn(), status: vi.fn().mockReturnThis(), send: vi.fn() }
}

const body = {
  expectedRevision: 2,
  defaults: { finish: "glossy", border: "none", cropMode: "fill", crop: { x: 0, y: 0, width: 1, height: 1 }, quantity: 1 },
  overrides: [],
  warningAcknowledgements: [],
}

describe("photo version Store handlers", () => {
  it("authorizes and creates an idempotent immutable version", async () => {
    const dependencies = {
      assertOwner: vi.fn(async () => undefined),
      createVersion: vi.fn(async () => ({ version: { id: "version_1" }, items: [] })),
      quoteVersion: vi.fn(),
    }
    const res = response()
    await handleCreateVersion(
      { params: { id: "job_1" }, headers: { "idempotency-key": "request_1" }, body },
      res,
      dependencies,
    )
    expect(dependencies.assertOwner).toHaveBeenCalledWith("job_1", expect.anything())
    expect(dependencies.createVersion).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "job_1",
      idempotencyKey: "request_1",
      expectedRevision: 2,
    }))
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ version: { id: "version_1" } }))
  })

  it("rejects client price fields nested in version settings", async () => {
    const dependencies = { assertOwner: vi.fn(), createVersion: vi.fn(), quoteVersion: vi.fn() }
    await expect(handleCreateVersion(
      {
        params: { id: "job_1" },
        headers: { "idempotency-key": "request_1" },
        body: { ...body, defaults: { ...body.defaults, unitPrice: 1 } },
      },
      response(),
      dependencies,
    )).rejects.toThrow("photo_client_price_forbidden")
    expect(dependencies.createVersion).not.toHaveBeenCalled()
  })
  it("requires a usable idempotency key", async () => {
    const dependencies = { assertOwner: vi.fn(), createVersion: vi.fn(), quoteVersion: vi.fn() }
    await expect(handleCreateVersion(
      { params: { id: "job_1" }, headers: {}, body },
      response(),
      dependencies,
    )).rejects.toThrow("photo_idempotency_key_required")
  })

  it("quotes only after ownership and rejects client pricing", async () => {
    const dependencies = {
      assertOwner: vi.fn(async () => undefined),
      createVersion: vi.fn(),
      quoteVersion: vi.fn(async () => ({ subtotal: 280, currencyCode: "hkd" })),
    }
    const res = response()
    await handleQuoteVersion(
      { params: { id: "job_1" }, headers: {}, body: { versionId: "version_1" } },
      res,
      dependencies,
    )
    expect(dependencies.quoteVersion).toHaveBeenCalledWith({ jobId: "job_1", versionId: "version_1" })

    await expect(handleQuoteVersion(
      { params: { id: "job_1" }, headers: {}, body: { versionId: "version_1", price: 1 } },
      response(),
      dependencies,
    )).rejects.toThrow("photo_client_price_forbidden")
  })
})
