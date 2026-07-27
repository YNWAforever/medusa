import { describe, expect, it, vi } from "vitest"

import { fulfillOrderedPhotoJobs } from "./order-fulfilled-photo"

describe("order fulfilled photo retention", () => {
  it("idempotently fulfills linked ordered jobs and stamps 720-hour expiry", async () => {
    const fulfilledAt = new Date("2026-07-20T10:00:00.000Z")
    const service: any = {
      listPhotoJobVersions: vi.fn(async () => [{ job_id: "job_1" }]),
      retrievePhotoJob: vi.fn(async () => ({ id: "job_1", status: "ordered", production_status: "shipped", revision: 4 })),
      updatePhotoJobs: vi.fn(async (input) => [{ id: "job_1", ...input.data }]),
    }
    await fulfillOrderedPhotoJobs({ orderId: "order_1", fulfilledAt }, { service })
    expect(service.updatePhotoJobs).toHaveBeenCalledWith({
      selector: { id: "job_1", status: "ordered" },
      data: expect.objectContaining({
        status: "fulfilled",
        production_status: "fulfilled",
        fulfilled_at: fulfilledAt,
        media_expires_at: new Date("2026-08-19T10:00:00.000Z"),
        revision: 5,
      }),
    })
    service.retrievePhotoJob.mockResolvedValue({ id: "job_1", status: "fulfilled", fulfilled_at: fulfilledAt })
    await fulfillOrderedPhotoJobs({ orderId: "order_1", fulfilledAt }, { service })
    expect(service.updatePhotoJobs).toHaveBeenCalledTimes(1)
  })
})
