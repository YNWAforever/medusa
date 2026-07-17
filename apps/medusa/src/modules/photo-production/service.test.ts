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
})
