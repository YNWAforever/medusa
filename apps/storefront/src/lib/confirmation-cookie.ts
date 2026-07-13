import "server-only"
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import type { OrderConfirmationView } from "./medusa/checkout"

export const ORDER_CONFIRMATION_COOKIE = "fm_order_confirmation"

export const orderConfirmationCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 900,
}

function keyFromSecret(secret: string): Buffer {
  if (!secret.trim()) throw new Error("STOREFRONT_SESSION_SECRET is required")
  return createHash("sha256").update(secret).digest()
}

function encode(value: Buffer): string {
  return value.toString("base64url")
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url")
}

function sessionSecret(secret?: string): string {
  const value = secret ?? process.env.STOREFRONT_SESSION_SECRET
  if (!value) throw new Error("STOREFRONT_SESSION_SECRET is required")
  return value
}

export function sealOrderConfirmation(payload: OrderConfirmationView, secret?: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(sessionSecret(secret)), iv)
  const plaintext = Buffer.from(JSON.stringify({ payload, issuedAt: Date.now() }), "utf8")
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return ["v1", encode(iv), encode(cipher.getAuthTag()), encode(ciphertext)].join(".")
}

function isConfirmation(value: unknown): value is OrderConfirmationView {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const source = value as Record<string, unknown>
  const total = source.total
  return typeof source.orderId === "string"
    && typeof source.displayId === "number"
    && Number.isInteger(source.displayId)
    && typeof source.email === "string"
    && (source.fulfillmentKind === "delivery" || source.fulfillmentKind === "pickup")
    && typeof source.createdAt === "string"
    && typeof total === "object"
    && total !== null
    && !Array.isArray(total)
    && (total as Record<string, unknown>).currencyCode === "hkd"
    && typeof (total as Record<string, unknown>).amount === "number"
    && Number.isSafeInteger((total as Record<string, unknown>).amount)
}

export function unsealOrderConfirmation(value: string | undefined, secret?: string): OrderConfirmationView | null {
  if (!value) return null
  try {
    const [version, encodedIv, encodedTag, encodedCiphertext] = value.split(".")
    if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) return null
    const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(sessionSecret(secret)), decode(encodedIv))
    decipher.setAuthTag(decode(encodedTag))
    const plaintext = Buffer.concat([decipher.update(decode(encodedCiphertext)), decipher.final()])
    const envelope = JSON.parse(plaintext.toString("utf8")) as Record<string, unknown>
    const issuedAt = envelope.issuedAt
    if (typeof issuedAt !== "number" || issuedAt < Date.now() - 900_000 || issuedAt > Date.now() + 30_000) return null
    return isConfirmation(envelope.payload) ? envelope.payload : null
  } catch {
    return null
  }
}
