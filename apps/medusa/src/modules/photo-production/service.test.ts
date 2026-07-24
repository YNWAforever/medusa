import { describe, expect, it, vi } from "vitest"
import PhotoProductionModuleService, {
  assertExactlyOnePhotoJobOwner,
} from "./service"
function createServiceWithGeneratedCreateSpy() {
  const generatedServicePrototype = Object.getPrototypeOf(
    PhotoProductionModuleService.prototype,
  )
  const createPhotoJobs = vi
    .fn()
    .mockResolvedValue([{ id: "photojob_123" }])

  vi.spyOn(generatedServicePrototype, "createPhotoJobs").mockImplementation(
    createPhotoJobs,
  )

  return {
    createPhotoJobs,
    service: new PhotoProductionModuleService({ baseRepository: {} } as never),
  }
}

describe("assertExactlyOnePhotoJobOwner", () => {
  it("accepts a guest-owned photo job", () => {
    expect(() =>
      assertExactlyOnePhotoJobOwner({ guest_owner_hash: "guest-hash" }),
    ).not.toThrow()
  })

  it("accepts a customer-owned photo job", () => {
    expect(() =>
      assertExactlyOnePhotoJobOwner({ customer_id: "cus_123" }),
    ).not.toThrow()
  })

  it("rejects a photo job without an owner", () => {
    expect(() => assertExactlyOnePhotoJobOwner({})).toThrow(
      "photo_job_owner_invalid",
    )
  })

  it("rejects a photo job with guest and customer owners", () => {
    expect(() =>
      assertExactlyOnePhotoJobOwner({
        guest_owner_hash: "guest-hash",
        customer_id: "cus_123",
      }),
    ).toThrow("photo_job_owner_invalid")
  })
})

describe("PhotoProductionModuleService photo job creation", () => {
  it.each([
    ["createPhotoJob", {}],
    ["createPhotoJob", { guest_owner_hash: "guest-hash", customer_id: "cus_123" }],
    ["createPhotoJobs", {}],
    ["createPhotoJobs", { guest_owner_hash: "guest-hash", customer_id: "cus_123" }],
  ] as const)("rejects an invalid owner through %s", async (method, input) => {
    const { createPhotoJobs, service } = createServiceWithGeneratedCreateSpy()

    await expect(service[method](input)).rejects.toThrow(
      "photo_job_owner_invalid",
    )
    expect(createPhotoJobs).not.toHaveBeenCalled()
  })

  it("validates each batch entry before delegating to generated persistence", async () => {
    const { createPhotoJobs, service } = createServiceWithGeneratedCreateSpy()
    const input = [
      { guest_owner_hash: "guest-hash" },
      { customer_id: "cus_123" },
    ]

    await expect(service.createPhotoJobs(input)).resolves.toEqual([
      { id: "photojob_123" },
    ])
    expect(createPhotoJobs).toHaveBeenCalledOnce()
    expect(createPhotoJobs).toHaveBeenCalledWith(input)
  })

  it("forwards the generated create context for a single photo job", async () => {
    const { createPhotoJobs, service } = createServiceWithGeneratedCreateSpy()
    const input = { guest_owner_hash: "guest-hash" }
    const sharedContext = { transactionId: "tx_123", source: "upload" }

    await expect(service.createPhotoJob(input, sharedContext)).resolves.toEqual([
      { id: "photojob_123" },
    ])
    expect(createPhotoJobs).toHaveBeenCalledOnce()
    expect(createPhotoJobs).toHaveBeenCalledWith(input, sharedContext)
  })
})

describe("PhotoProductionModuleService transactions", () => {
  it("injects one transaction manager into the callback context", async () => {
    const transactionManager = { id: "tx_123" }
    const transaction = vi.fn(async (
      callback: (manager: typeof transactionManager) => Promise<unknown>,
    ) => callback(transactionManager))
    const service = new PhotoProductionModuleService({
      baseRepository: { transaction },
    } as never)
    const callback = vi.fn(async (context: Record<string, unknown>) => context)

    await service.withPhotoJobTransaction(callback, {
      isolationLevel: "serializable",
    })

    expect(transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "serializable" }),
    )
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      transactionManager,
    }))
  })
})
