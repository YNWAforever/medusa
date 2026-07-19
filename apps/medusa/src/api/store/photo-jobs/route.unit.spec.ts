import { describe, expect, it, vi } from "vitest"
import {
  createMedusaPhotoJobOperations,
  handleStorePhotoJobClaimPost,
  handleStorePhotoJobDelete,
  handleStorePhotoJobGet,
  handleStorePhotoJobsGet,
  handleStorePhotoJobsPost,
  type PhotoJobOperations,
} from "./route"
import { hashGuestSecret } from "../../../modules/photo-production/ownership"

const guestSecret = "gqVvUs6_vDW0BsZO8B0Kjt6fKLsWbX8WGkzev2TI17Y"
const guestHash = hashGuestSecret(guestSecret).toString("hex")

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "phjob_123",
    guest_owner_hash: guestHash,
    customer_id: null,
    region_id: "reg_hk",
    locale: "en",
    currency_code: "hkd",
    product_handle: "classic-4r-photo-print",
    status: "draft",
    revision: 4,
    retention_class: "standard",
    last_activity_at: new Date("2026-07-18T00:00:00.000Z"),
    ...overrides,
  }
}

function asset(overrides: Record<string, unknown> = {}) {
  return {
    id: "phast_123",
    job_id: "phjob_123",
    display_name: "family.jpg",
    object_key: "private/jobs/phjob_123/original.jpg",
    preview_key: "private/jobs/phjob_123/preview.jpg",
    crc32c: "private-checksum",
    sha256: "private-hash",
    expected_bytes: 2048,
    stored_bytes: 2048,
    detected_mime_type: "image/jpeg",
    width: 1800,
    height: 1200,
    orientation: 1,
    quality_band: "good",
    estimated_ppi: 300,
    warnings: [],
    errors: [],
    status: "ready",
    failure_code: null,
    deletion_requested_at: null,
    provider_cleanup_completed_at: null,
    ...overrides,
  }
}

function operations(overrides: Partial<PhotoJobOperations> = {}): PhotoJobOperations {
  return {
    async createPhotoJob(input) {
      return job(input)
    },
    async listPhotoJobs() {
      return [job()]
    },
    async retrievePhotoJob() {
      return job()
    },
    async listPhotoAssets() {
      return []
    },
    async retrievePhotoJobVersion() {
      return null
    },
    async listPrintItems() {
      return []
    },
    async updatePhotoJob(_selector, data) {
      return job(data)
    },
    async withTransaction(callback) {
      return callback(this)
    },
    async resolveHongKongPhotoProduct() {
      return { regionId: "reg_hk", currencyCode: "hkd" }
    },
    ...overrides,
  }
}

function response() {
  return { json: vi.fn(), status: vi.fn().mockReturnThis() }
}

function guestRequest(overrides: Record<string, unknown> = {}) {
  return {
    headers: { get: (name: string) => name === "x-fotomax-guest-token" ? guestSecret : null },
    ...overrides,
  }
}

async function expectCode(action: () => Promise<unknown>, code: string) {
  await expect(action()).rejects.toThrow(code)
}

describe("store photo-job ownership", () => {
  it("creates a guest-owned job using the live Hong Kong product context", async () => {
    const res = response()
    const createPhotoJob = vi.fn(async (input: Record<string, unknown>) => job(input))

    await handleStorePhotoJobsPost(
      guestRequest({ body: { locale: "zh-HK" } }),
      res,
      () => operations({ createPhotoJob }),
    )

    expect(createPhotoJob).toHaveBeenCalledWith(expect.objectContaining({ guest_owner_hash: guestHash }))
    expect(res.json).toHaveBeenCalledWith({ photo_job: expect.objectContaining({
      id: "phjob_123",
      locale: "zh-HK",
      region_id: "reg_hk",
      currency_code: "hkd",
      product_handle: "classic-4r-photo-print",
    }) })
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain("guest_owner_hash")
  })

  it("lists only jobs belonging to the current customer", async () => {
    const listPhotoJobs = vi.fn(async () => [job({ guest_owner_hash: null, customer_id: "cus_123" })])
    const res = response()

    await handleStorePhotoJobsGet(
      guestRequest({ auth_context: { actor_id: "cus_123" } }),
      res,
      () => operations({ listPhotoJobs }),
    )

    expect(listPhotoJobs).toHaveBeenCalledWith({ customer_id: "cus_123" })
    expect(res.json).toHaveBeenCalledWith({ photo_jobs: [expect.objectContaining({ id: "phjob_123" })] })
  })

  it("returns an empty list for a first-time guest without resolving an owner", async () => {
    const listPhotoJobs = vi.fn()
    const res = response()

    await handleStorePhotoJobsGet(
      guestRequest({ headers: { get: () => null } }),
      res,
      () => operations({ listPhotoJobs }),
    )

    expect(listPhotoJobs).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({ photo_jobs: [] })
  })

  it("masks a cross-owner retrieval as not found", async () => {
    await expectCode(
      () => handleStorePhotoJobGet(guestRequest({ params: { id: "phjob_123" } }), response(), () => operations({
        retrievePhotoJob: async () => job({ guest_owner_hash: null, customer_id: "cus_other" }),
      })),
      "photo_job_not_found",
    )
  })

  it("masks expired jobs as not found", async () => {
    await expectCode(
      () => handleStorePhotoJobGet(guestRequest({ params: { id: "phjob_123" } }), response(), () => operations({
        retrievePhotoJob: async () => job({ status: "expired" }),
      })),
      "photo_job_not_found",
    )
  })

  it("hydrates an owner-visible job with safe assets for refresh recovery", async () => {
    const listPhotoAssets = vi.fn(async () => [asset()])
    const res = response()

    await handleStorePhotoJobGet(
      guestRequest({ params: { id: "phjob_123" } }),
      res,
      () => operations({ listPhotoAssets }),
    )

    expect(listPhotoAssets).toHaveBeenCalledWith("phjob_123")
    expect(res.json).toHaveBeenCalledWith({ photo_job: expect.objectContaining({
      id: "phjob_123",
      assets: [expect.objectContaining({
        id: "phast_123",
        display_name: "family.jpg",
        status: "ready",
        width: 1800,
        height: 1200,
        quality_band: "good",
      })],
    }) })
    const serialized = JSON.stringify(res.json.mock.calls[0][0])
    for (const privateField of [
      "object_key",
      "preview_key",
      "crc32c",
      "sha256",
      "job_id",
      "deletion_requested_at",
      "provider_cleanup_completed_at",
    ]) expect(serialized).not.toContain(privateField)
  })

  it("hydrates the active version with safe effective print settings", async () => {
    const res = response()
    await handleStorePhotoJobGet(
      guestRequest({ params: { id: "phjob_123" } }),
      res,
      () => operations({
        retrievePhotoJob: async () => job({ active_version_id: "phver_123" }),
        retrievePhotoJobVersion: async () => ({ id: "phver_123", defaults: { finish: "matte", border: "white", cropMode: "fit", crop: { x: 0, y: 0, width: 1, height: 1 }, quantity: 2 }, idempotency_key: "private" }),
        listPrintItems: async () => [{ id: "phitem_123", version_id: "phver_123", asset_id: "phast_123", finish: "glossy", border: "white", crop_mode: "fill", crop: { x: 0.1, y: 0, width: 0.8, height: 1 }, quantity: 4, warning_acknowledgements: ["quality_caution"], unit_price_snapshot: 99 }],
      } as any),
    )

    const payload = res.json.mock.calls[0][0]
    expect(payload.photo_job.active_version).toEqual({
      id: "phver_123",
      defaults: expect.objectContaining({ finish: "matte", quantity: 2 }),
      items: [expect.objectContaining({ asset_id: "phast_123", finish: "glossy", quantity: 4 })],
    })
    expect(JSON.stringify(payload)).not.toContain("idempotency_key")
    expect(JSON.stringify(payload)).not.toContain("unit_price_snapshot")
  })

  it("does not list assets until the job owner has been authorized", async () => {
    const listPhotoAssets = vi.fn(async () => [asset()])

    await expectCode(
      () => handleStorePhotoJobGet(
        guestRequest({ params: { id: "phjob_123" } }),
        response(),
        () => operations({
          retrievePhotoJob: async () => job({ guest_owner_hash: null, customer_id: "cus_other" }),
          listPhotoAssets,
        }),
      ),
      "photo_job_not_found",
    )

    expect(listPhotoAssets).not.toHaveBeenCalled()
  })

  it("returns a conflict for a stale cancellation revision", async () => {
    await expectCode(
      () => handleStorePhotoJobDelete(guestRequest({
        params: { id: "phjob_123" },
        headers: { get: (name: string) => name === "x-fotomax-guest-token" ? guestSecret : name === "if-match" ? "3" : null },
      }), response(), () => operations()),
      "photo_job_conflict",
    )
  })

  it("cancels with a conditional selector containing id, revision, and current guest owner", async () => {
    const updatePhotoJob = vi.fn(async (_selector: Record<string, unknown>, data: Record<string, unknown>) => job(data))
    const res = response()

    await handleStorePhotoJobDelete(guestRequest({
      params: { id: "phjob_123" },
      headers: { get: (name: string) => name === "x-fotomax-guest-token" ? guestSecret : name === "if-match" ? "4" : null },
    }), res, () => operations({ updatePhotoJob }))

    expect(updatePhotoJob).toHaveBeenCalledWith(
      { id: "phjob_123", revision: 4, guest_owner_hash: guestHash, customer_id: null },
      expect.objectContaining({ status: "cancelled", revision: 5 }),
    )
  })

  it("returns a conflict when a concurrent cancellation update matches no rows", async () => {
    await expectCode(
      () => handleStorePhotoJobDelete(guestRequest({
        params: { id: "phjob_123" },
        headers: { get: (name: string) => name === "x-fotomax-guest-token" ? guestSecret : name === "if-match" ? "4" : null },
      }), response(), () => operations({
        updatePhotoJob: async () => null,
      })),
      "photo_job_conflict",
    )
  })

  it("rejects repeated cancellation of a terminal job without updating it", async () => {
    const updatePhotoJob = vi.fn()

    await expectCode(
      () => handleStorePhotoJobDelete(guestRequest({
        params: { id: "phjob_123" },
        headers: { get: (name: string) => name === "x-fotomax-guest-token" ? guestSecret : name === "if-match" ? "4" : null },
      }), response(), () => operations({
        retrievePhotoJob: async () => job({ status: "cancelled" }),
        updatePhotoJob,
      })),
      "photo_job_conflict",
    )

    expect(updatePhotoJob).not.toHaveBeenCalled()
  })

  it("claims a guest job for its authenticated customer", async () => {
    const updatePhotoJob = vi.fn(async (_selector: Record<string, unknown>, data: Record<string, unknown>) => job(data))
    const res = response()

    await handleStorePhotoJobClaimPost(guestRequest({
      params: { id: "phjob_123" },
      auth_context: { actor_id: "cus_123" },
      headers: { get: (name: string) => name === "x-fotomax-guest-token" ? guestSecret : name === "if-match" ? "4" : null },
    }), res, () => operations({ updatePhotoJob }))

    expect(updatePhotoJob).toHaveBeenCalledWith(
      { id: "phjob_123", revision: 4, guest_owner_hash: guestHash, customer_id: null },
      expect.objectContaining({ guest_owner_hash: null, customer_id: "cus_123", revision: 5 }),
    )
  })

  it("does not reveal a customer-owned job to a different customer during claim", async () => {
    await expectCode(
      () => handleStorePhotoJobClaimPost(guestRequest({
        params: { id: "phjob_123" },
        auth_context: { actor_id: "cus_123" },
        headers: { get: (name: string) => name === "if-match" ? "3" : null },
      }), response(), () => operations({
        retrievePhotoJob: async () => job({ guest_owner_hash: null, customer_id: "cus_other" }),
      })),
      "photo_job_not_found",
    )
  })

  it("checks claim ownership before revision to avoid enumerating another customer's job", async () => {
    await expectCode(
      () => handleStorePhotoJobClaimPost(guestRequest({
        params: { id: "phjob_123" },
        auth_context: { actor_id: "cus_123" },
        headers: { get: () => null },
      }), response(), () => operations({
        retrievePhotoJob: async () => job({ guest_owner_hash: null, customer_id: "cus_other" }),
      })),
      "photo_job_not_found",
    )
  })

  it("treats a same-customer claim as idempotent", async () => {
    const updatePhotoJob = vi.fn()
    const res = response()

    await handleStorePhotoJobClaimPost(guestRequest({
      params: { id: "phjob_123" },
      auth_context: { actor_id: "cus_123" },
      headers: { get: (name: string) => name === "if-match" ? "4" : null },
    }), res, () => operations({
      retrievePhotoJob: async () => job({ guest_owner_hash: null, customer_id: "cus_123" }),
      updatePhotoJob,
    }))

    expect(updatePhotoJob).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({ photo_job: expect.objectContaining({ id: "phjob_123" }) })
  })

  it("treats a same-customer claim retry at the original revision as idempotent after the claim advanced once", async () => {
    const updatePhotoJob = vi.fn()
    const res = response()

    await handleStorePhotoJobClaimPost(guestRequest({
      params: { id: "phjob_123" },
      auth_context: { actor_id: "cus_123" },
      headers: { get: (name: string) => name === "if-match" ? "4" : null },
    }), res, () => operations({
      retrievePhotoJob: async () => job({ guest_owner_hash: null, customer_id: "cus_123", revision: 5 }),
      updatePhotoJob,
    }))

    expect(updatePhotoJob).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({ photo_job: expect.objectContaining({
      id: "phjob_123",
      revision: 5,
    }) })
  })

  it("returns a conflict for unrelated stale same-customer claim revisions", async () => {
    await expectCode(
      () => handleStorePhotoJobClaimPost(guestRequest({
        params: { id: "phjob_123" },
        auth_context: { actor_id: "cus_123" },
        headers: { get: (name: string) => name === "if-match" ? "3" : null },
      }), response(), () => operations({
        retrievePhotoJob: async () => job({ guest_owner_hash: null, customer_id: "cus_123", revision: 5 }),
      })),
      "photo_job_conflict",
    )
  })

  it("returns idempotent success when a conditional claim update loses the response but the owner changed to the same customer", async () => {
    const retrievePhotoJob = vi
      .fn()
      .mockResolvedValueOnce(job())
      .mockResolvedValueOnce(job({ guest_owner_hash: null, customer_id: "cus_123", revision: 5 }))
    const res = response()

    await handleStorePhotoJobClaimPost(guestRequest({
      params: { id: "phjob_123" },
      auth_context: { actor_id: "cus_123" },
      headers: { get: (name: string) => name === "x-fotomax-guest-token" ? guestSecret : name === "if-match" ? "4" : null },
    }), res, () => operations({
      retrievePhotoJob,
      updatePhotoJob: async () => null,
    }))

    expect(retrievePhotoJob).toHaveBeenCalledTimes(2)
    expect(res.json).toHaveBeenCalledWith({ photo_job: expect.objectContaining({
      id: "phjob_123",
      revision: 5,
    }) })
  })

  it("returns a conflict when a conditional claim update matches no rows for another change", async () => {
    const retrievePhotoJob = vi
      .fn()
      .mockResolvedValueOnce(job())
      .mockResolvedValueOnce(job({ revision: 6 }))

    await expectCode(
      () => handleStorePhotoJobClaimPost(guestRequest({
        params: { id: "phjob_123" },
        auth_context: { actor_id: "cus_123" },
        headers: { get: (name: string) => name === "x-fotomax-guest-token" ? guestSecret : name === "if-match" ? "4" : null },
      }), response(), () => operations({
        retrievePhotoJob,
        updatePhotoJob: async () => null,
      })),
      "photo_job_conflict",
    )
  })

  it("adapts generated updatePhotoJobs selector/data calls and treats no match as null", async () => {
    const updatePhotoJobs = vi
      .fn()
      .mockResolvedValueOnce([job({ revision: 5 })])
      .mockResolvedValueOnce([])
    const scope = {
      resolve: vi.fn((key: unknown) => key === "photoProduction" ? { updatePhotoJobs } : {}),
    }
    const operations = createMedusaPhotoJobOperations(scope as never)
    const selector = { id: "phjob_123", revision: 4, guest_owner_hash: guestHash, customer_id: null }
    const data = { revision: 5 }

    await expect(operations.updatePhotoJob(selector, data)).resolves.toEqual(expect.objectContaining({ revision: 5 }))
    await expect(operations.updatePhotoJob(selector, data)).resolves.toBeNull()
    expect(updatePhotoJobs).toHaveBeenCalledWith({ selector, data })
  })

  it("adapts owner-scoped asset listing and drops deleted assets", async () => {
    const listPhotoAssets = vi.fn(async () => [asset(), asset({ id: "phast_deleted", status: "deleted" })])
    const scope = {
      resolve: vi.fn((key: unknown) => key === "photoProduction" ? { listPhotoAssets } : {}),
    }
    const operations = createMedusaPhotoJobOperations(scope as never)

    await expect(operations.listPhotoAssets("phjob_123")).resolves.toEqual([
      expect.objectContaining({ id: "phast_123" }),
    ])
    expect(listPhotoAssets).toHaveBeenCalledWith({ job_id: "phjob_123" })
  })

  it("runs ownership mutations with a serializable shared transaction context", async () => {
    const transactionContext = { transactionManager: { id: "tx_123" } }
    const updatePhotoJobs = vi.fn().mockResolvedValue([job({ revision: 5 })])
    const withPhotoJobTransaction = vi.fn(async (
      callback: (context: Record<string, unknown>) => Promise<unknown>,
    ) => callback(transactionContext))
    const service = { updatePhotoJobs, withPhotoJobTransaction }
    const scope = {
      resolve: vi.fn((key: unknown) => key === "photoProduction" ? service : {}),
    }
    const operations = createMedusaPhotoJobOperations(scope as never)
    const selector = { id: "phjob_123", revision: 4 }
    const data = { revision: 5 }

    await operations.withTransaction(async (transactionOperations) => {
      await transactionOperations.updatePhotoJob(selector, data)
    })

    expect(withPhotoJobTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "SERIALIZABLE" },
    )
    expect(updatePhotoJobs).toHaveBeenCalledWith(
      { selector, data },
      transactionContext,
    )
  })
})
