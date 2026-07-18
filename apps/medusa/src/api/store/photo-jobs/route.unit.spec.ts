import { describe, expect, it, vi } from "vitest"
import {
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
    async updatePhotoJob(_id, input) {
      return job(input)
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

  it("returns a conflict for a stale cancellation revision", async () => {
    await expectCode(
      () => handleStorePhotoJobDelete(guestRequest({
        params: { id: "phjob_123" },
        headers: { get: (name: string) => name === "x-fotomax-guest-token" ? guestSecret : name === "if-match" ? "3" : null },
      }), response(), () => operations()),
      "photo_job_conflict",
    )
  })

  it("claims a guest job for its authenticated customer", async () => {
    const updatePhotoJob = vi.fn(async (_id: string, input: Record<string, unknown>) => job(input))
    const res = response()

    await handleStorePhotoJobClaimPost(guestRequest({
      params: { id: "phjob_123" },
      auth_context: { actor_id: "cus_123" },
      headers: { get: (name: string) => name === "x-fotomax-guest-token" ? guestSecret : name === "if-match" ? "4" : null },
    }), res, () => operations({ updatePhotoJob }))

    expect(updatePhotoJob).toHaveBeenCalledWith("phjob_123", expect.objectContaining({
      guest_owner_hash: null,
      customer_id: "cus_123",
      revision: 5,
    }))
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
})
