import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

export const PHOTO_GUEST_COOKIE = "fm_photo_guest"
export const PHOTO_GUEST_TTL_SECONDS = 60 * 60 * 24 * 7

export type PhotoOwnerContext =
  | { kind: "guest"; digest: Buffer }
  | { kind: "customer"; customerId: string }

export interface PhotoOwnerContextInput {
  guestSecret?: string | null
  customerId?: string | null
}

const GUEST_SECRET_BYTES = 32
const GUEST_SECRET_PATTERN = /^[A-Za-z0-9_-]+$/
const GUEST_DIGEST_HEX_PATTERN = /^[a-f0-9]{64}$/i

function isValidGuestSecret(secret: string): boolean {
  if (!GUEST_SECRET_PATTERN.test(secret)) {
    return false
  }

  try {
    return Buffer.from(secret, "base64url").length === GUEST_SECRET_BYTES
  } catch {
    return false
  }
}

export function createGuestSecret(): string {
  return randomBytes(GUEST_SECRET_BYTES).toString("base64url")
}

export function hashGuestSecret(secret: string): Buffer {
  if (!isValidGuestSecret(secret)) {
    throw new Error("photo_guest_secret_invalid")
  }

  return createHash("sha256").update(secret, "utf8").digest()
}

export function verifyGuestSecret(secret: string, expectedHex: string): boolean {
  if (!GUEST_DIGEST_HEX_PATTERN.test(expectedHex) || !isValidGuestSecret(secret)) {
    return false
  }

  const actual = hashGuestSecret(secret)
  const expected = Buffer.from(expectedHex, "hex")
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function resolvePhotoOwnerContext({
  guestSecret,
  customerId,
}: PhotoOwnerContextInput): PhotoOwnerContext {
  const normalizedCustomerId = customerId?.trim() || null
  const normalizedGuestSecret = guestSecret?.trim() || null

  if (normalizedCustomerId && normalizedGuestSecret) {
    throw new Error("photo_job_owner_invalid")
  }
  if (normalizedCustomerId) {
    return { kind: "customer", customerId: normalizedCustomerId }
  }
  if (normalizedGuestSecret) {
    return { kind: "guest", digest: hashGuestSecret(normalizedGuestSecret) }
  }

  throw new Error("photo_job_owner_invalid")
}
