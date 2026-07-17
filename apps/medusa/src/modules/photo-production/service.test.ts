import { describe, expect, it } from "vitest"
import { assertExactlyOnePhotoJobOwner } from "./service"

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
