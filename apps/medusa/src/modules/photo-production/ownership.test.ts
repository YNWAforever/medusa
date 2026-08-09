import { describe, expect, it, vi } from "vitest"

const timingSafeEqual = vi.hoisted(() =>
  vi.fn((actual: Buffer, expected: Buffer) => actual.equals(expected)),
)

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>()
  return {
    ...actual,
    timingSafeEqual,
  }
})

import {
  createGuestSecret,
  hashGuestSecret,
  PHOTO_GUEST_COOKIE,
  PHOTO_GUEST_TTL_SECONDS,
  resolvePhotoOwnerContext,
  verifyGuestSecret,
} from "./ownership"

describe("photo guest ownership", () => {
  it("creates a 32-byte base64url secret for the private guest cookie", () => {
    const secret = createGuestSecret()

    expect(PHOTO_GUEST_COOKIE).toBe("fm_photo_guest")
    expect(PHOTO_GUEST_TTL_SECONDS).toBe(60 * 60 * 24 * 7)
    expect(secret).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(Buffer.from(secret, "base64url")).toHaveLength(32)
  })

  it("hashes and verifies only the matching guest secret", () => {
    const secret = createGuestSecret()
    const digest = hashGuestSecret(secret)

    expect(digest).toHaveLength(32)
    expect(verifyGuestSecret(secret, digest.toString("hex"))).toBe(true)
    expect(verifyGuestSecret(createGuestSecret(), digest.toString("hex"))).toBe(false)
  })

  it.each(["", "not base64url!", "a", "AAAA"])(
    "rejects malformed guest secret %j",
    (secret) => {
      expect(() => hashGuestSecret(secret)).toThrow("photo_guest_secret_invalid")
      expect(verifyGuestSecret(secret, "a".repeat(64))).toBe(false)
    },
  )

  it("uses fixed-time comparison only after normalizing equal-length digests", () => {
    const secret = createGuestSecret()
    const digest = hashGuestSecret(secret).toString("hex")
    timingSafeEqual.mockClear()

    expect(verifyGuestSecret(secret, digest)).toBe(true)
    expect(timingSafeEqual).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.any(Buffer),
    )
    const [actual, expected] = timingSafeEqual.mock.calls[0]
    expect(actual).toHaveLength(32)
    expect(expected).toHaveLength(32)
  })

  it.each([
    ["guest", { guestSecret: createGuestSecret() }, { kind: "guest" }],
    ["customer", { customerId: "cus_123" }, { kind: "customer", customerId: "cus_123" }],
  ] as const)("resolves a %s owner context", (_kind, input, expected) => {
    expect(resolvePhotoOwnerContext(input)).toMatchObject(expected)
  })

  it("rejects ambiguous dual ownership", () => {
    expect(() =>
      resolvePhotoOwnerContext({
        guestSecret: createGuestSecret(),
        customerId: "cus_123",
      }),
    ).toThrow("photo_job_owner_invalid")
  })
})
