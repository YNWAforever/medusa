import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"

import { PhotoSourceError, type PhotoSourceType } from "./types"

export const PROVIDER_TOKEN_KEY_ENV = "PHOTO_PROVIDER_TOKEN_KEY"
export const CURRENT_KEY_VERSION = 1

const KEY_BYTES = 32
const IV_BYTES = 12

export interface TokenVaultContext {
  importSessionId: string
  sourceType: PhotoSourceType
  keyVersion: number
}

export interface SealedProviderSecret {
  ciphertext: string
  keyVersion: number
}

/**
 * Provider credentials — Google access tokens, Dropbox direct links — exist
 * encrypted only while an import is active, and never in plaintext at rest.
 *
 * The context is bound as AEAD additional data, so a ciphertext lifted from one
 * import session cannot be replayed into another.
 */
export class ProviderTokenVault {
  readonly #key: Buffer

  constructor(key: Buffer, readonly keyVersion: number = CURRENT_KEY_VERSION) {
    if (key.length !== KEY_BYTES) {
      throw new PhotoSourceError("photo_source_token_invalid")
    }
    this.#key = key
  }

  static fromEnvironment(
    source: Record<string, string | undefined> = process.env,
  ): ProviderTokenVault {
    const encoded = source[PROVIDER_TOKEN_KEY_ENV]?.trim()

    if (!encoded) {
      throw new Error(`${PROVIDER_TOKEN_KEY_ENV} is required to import photos`)
    }

    let key: Buffer
    try {
      key = Buffer.from(encoded, "base64")
    } catch {
      throw new Error(`${PROVIDER_TOKEN_KEY_ENV} must be base64`)
    }

    if (key.length !== KEY_BYTES) {
      throw new Error(`${PROVIDER_TOKEN_KEY_ENV} must decode to ${KEY_BYTES} bytes`)
    }

    return new ProviderTokenVault(key)
  }

  seal(
    secret: string,
    context: TokenVaultContext,
    expiresAt: Date,
  ): SealedProviderSecret {
    if (context.keyVersion !== this.keyVersion) {
      throw new PhotoSourceError("photo_source_token_invalid")
    }

    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv)
    cipher.setAAD(Buffer.from(serializeContext(context), "utf8"))

    const plaintext = Buffer.from(
      JSON.stringify({ secret, expiresAt: expiresAt.toISOString() }),
      "utf8",
    )
    const body = Buffer.concat([cipher.update(plaintext), cipher.final()])

    return {
      ciphertext: [
        `v${context.keyVersion}`,
        iv.toString("base64url"),
        cipher.getAuthTag().toString("base64url"),
        body.toString("base64url"),
      ].join("."),
      keyVersion: context.keyVersion,
    }
  }

  open(ciphertext: string, context: TokenVaultContext, now: Date = new Date()): string {
    const [version, encodedIv, encodedTag, encodedBody] = ciphertext.split(".")

    if (version !== `v${context.keyVersion}` || !encodedIv || !encodedTag || !encodedBody) {
      throw new PhotoSourceError("photo_source_token_invalid")
    }

    let plaintext: Buffer
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.#key,
        Buffer.from(encodedIv, "base64url"),
      )
      decipher.setAAD(Buffer.from(serializeContext(context), "utf8"))
      decipher.setAuthTag(Buffer.from(encodedTag, "base64url"))
      plaintext = Buffer.concat([
        decipher.update(Buffer.from(encodedBody, "base64url")),
        decipher.final(),
      ])
    } catch {
      // Tampered ciphertext, wrong key, or wrong context all land here, and all
      // mean the same thing to the caller.
      throw new PhotoSourceError("photo_source_token_invalid")
    }

    const envelope = JSON.parse(plaintext.toString("utf8")) as {
      secret?: unknown
      expiresAt?: unknown
    }

    if (typeof envelope.secret !== "string" || typeof envelope.expiresAt !== "string") {
      throw new PhotoSourceError("photo_source_token_invalid")
    }

    const expiresAt = Date.parse(envelope.expiresAt)
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
      throw new PhotoSourceError("photo_source_token_expired")
    }

    return envelope.secret
  }

  /** Constant-time comparison for provider-supplied state/nonce values. */
  static matches(left: string, right: string): boolean {
    const a = Buffer.from(left, "utf8")
    const b = Buffer.from(right, "utf8")
    return a.length === b.length && timingSafeEqual(a, b)
  }

  /**
   * Guards against a vault instance being logged or serialized. The key is a
   * private field, but `toJSON` closes the accidental-JSON.stringify path.
   */
  toJSON(): Record<string, unknown> {
    return { keyVersion: this.keyVersion, key: "[redacted]" }
  }
}

function serializeContext(context: TokenVaultContext): string {
  return `${context.importSessionId}|${context.sourceType}|${context.keyVersion}`
}
