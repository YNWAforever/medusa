import { describe, expect, it, vi } from "vitest"

import { createPhotoJobVersion } from "./create-photo-job-version"
import { quotePhotoJob } from "./quote-photo-job"

describe("ordered photo instruction immutability", () => {
  it("rejects creating another version after cart attachment or ordering", async () => {
    for (const status of ["cart_attached", "ordered"]) {
      const store: any = {
        transaction: async (action: (tx: unknown) => unknown) => action(store),
        findVersionByIdempotency: vi.fn(async () => null),
        retrieveJob: vi.fn(async () => ({ id: "job_1", revision: 2, status })),
      }
      await expect(createPhotoJobVersion({
        jobId: "job_1", idempotencyKey: `key-${status}`, expectedRevision: 2,
        defaults: {} as never, overrides: [], warningAcknowledgements: [],
      }, store)).rejects.toThrow("photo_job_conflict")
    }
  })

  it("rejects re-quoting an ordered version before mutating print rows", async () => {
    const store: any = {
      retrieveVersion: vi.fn(async () => ({ id: "version_1", job_id: "job_1", order_id: "order_1" })),
      listItems: vi.fn(),
    }
    await expect(quotePhotoJob({ jobId: "job_1", versionId: "version_1" }, store))
      .rejects.toThrow("photo_order_conflict")
    expect(store.listItems).not.toHaveBeenCalled()
  })
})
