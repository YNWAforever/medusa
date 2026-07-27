import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"

import {
  CURRENT_KEY_VERSION,
  PROVIDER_TOKEN_KEY_ENV,
  ProviderTokenVault,
  type TokenVaultContext,
} from "./token-vault"
import { PhotoSourceError } from "./types"

const key = randomBytes(32)
const secret = "ya29.provider-access-token"

const context: TokenVaultContext = {
  importSessionId: "phimp_123",
  sourceType: "google_photos",
  keyVersion: CURRENT_KEY_VERSION,
}

function future(minutes = 10): Date {
  return new Date(Date.now() + minutes * 60_000)
}

describe("ProviderTokenVault", () => {
  it("round-trips a secret under the matching context", () => {
    const vault = new ProviderTokenVault(key)
    const sealed = vault.seal(secret, context, future())

    expect(sealed.keyVersion).toBe(CURRENT_KEY_VERSION)
    expect(vault.open(sealed.ciphertext, context)).toBe(secret)
  })

  it("never exposes the plaintext secret in the ciphertext", () => {
    const sealed = new ProviderTokenVault(key).seal(secret, context, future())

    expect(sealed.ciphertext).not.toContain(secret)
    expect(sealed.ciphertext).not.toContain("ya29")
  })

  it("uses a fresh IV so the same secret never seals identically", () => {
    const vault = new ProviderTokenVault(key)
    const first = vault.seal(secret, context, future())
    const second = vault.seal(secret, context, future())

    expect(first.ciphertext).not.toBe(second.ciphertext)
  })

  it("rejects an altered ciphertext", () => {
    const vault = new ProviderTokenVault(key)
    const sealed = vault.seal(secret, context, future())
    const [version, iv, tag, body] = sealed.ciphertext.split(".")
    const flipped = Buffer.from(body, "base64url")
    flipped[0] ^= 0x01

    expect(() =>
      vault.open([version, iv, tag, flipped.toString("base64url")].join("."), context),
    ).toThrow(PhotoSourceError)
  })

  it("rejects a ciphertext opened with a different key", () => {
    const sealed = new ProviderTokenVault(key).seal(secret, context, future())

    expect(() =>
      new ProviderTokenVault(randomBytes(32)).open(sealed.ciphertext, context),
    ).toThrow("photo_source_token_invalid")
  })

  it.each([
    ["a different import session", { importSessionId: "phimp_other" }],
    ["a different source type", { sourceType: "dropbox" as const }],
  ])("rejects a ciphertext replayed into %s", (_label, override) => {
    const vault = new ProviderTokenVault(key)
    const sealed = vault.seal(secret, context, future())

    expect(() =>
      vault.open(sealed.ciphertext, { ...context, ...override }),
    ).toThrow("photo_source_token_invalid")
  })

  it("rejects an expired payload distinctly from a tampered one", () => {
    const vault = new ProviderTokenVault(key)
    const sealed = vault.seal(secret, context, new Date(Date.now() + 1000))

    expect(() =>
      vault.open(sealed.ciphertext, context, new Date(Date.now() + 60_000)),
    ).toThrow("photo_source_token_expired")
  })

  it("rejects a key that is not 32 bytes", () => {
    expect(() => new ProviderTokenVault(randomBytes(16))).toThrow(PhotoSourceError)
  })

  it("refuses to seal under a key version it does not hold", () => {
    expect(() =>
      new ProviderTokenVault(key).seal(secret, { ...context, keyVersion: 99 }, future()),
    ).toThrow("photo_source_token_invalid")
  })

  it("does not leak the key when serialized", () => {
    const vault = new ProviderTokenVault(key)

    const serialized = JSON.stringify({ vault })

    expect(serialized).not.toContain(key.toString("base64"))
    expect(serialized).not.toContain(key.toString("hex"))
    expect(serialized).toContain("[redacted]")
  })

  describe("fromEnvironment", () => {
    it("loads a base64 32-byte key", () => {
      const vault = ProviderTokenVault.fromEnvironment({
        [PROVIDER_TOKEN_KEY_ENV]: key.toString("base64"),
      })

      expect(vault.open(vault.seal(secret, context, future()).ciphertext, context)).toBe(secret)
    })

    it.each([undefined, "", "   "])("requires the key to be present (%s)", (value) => {
      expect(() =>
        ProviderTokenVault.fromEnvironment({ [PROVIDER_TOKEN_KEY_ENV]: value }),
      ).toThrow(PROVIDER_TOKEN_KEY_ENV)
    })

    it("rejects a key of the wrong decoded length", () => {
      expect(() =>
        ProviderTokenVault.fromEnvironment({
          [PROVIDER_TOKEN_KEY_ENV]: randomBytes(16).toString("base64"),
        }),
      ).toThrow("32 bytes")
    })
  })

  describe("matches", () => {
    it("compares equal values without leaking length mismatches as throws", () => {
      expect(ProviderTokenVault.matches("state-abc", "state-abc")).toBe(true)
      expect(ProviderTokenVault.matches("state-abc", "state-abd")).toBe(false)
      expect(ProviderTokenVault.matches("state-abc", "longer-state-value")).toBe(false)
    })
  })
})
