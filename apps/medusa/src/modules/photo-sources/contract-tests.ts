import { describe, expect, it } from "vitest"

import { PhotoSourceError, type PhotoSourceAdapter, type PhotoSourceType } from "./types"

export interface AdapterContractHarness {
  adapter: PhotoSourceAdapter
  /** A job that already has at least one selectable item. */
  photoJobId: string
  ownerKey: string
  /** Moves the clock past the session's expiry so expiry paths can be proven. */
  expireSession(importSessionId: string): Promise<void> | void
}

export interface AdapterContractOptions {
  sourceType: PhotoSourceType
  /** Fresh harness per test, so cases cannot leak state into each other. */
  createHarness(): Promise<AdapterContractHarness> | AdapterContractHarness
}

const secretPattern =
  /(ya29\.|Bearer\s|refresh_token|access_token|client_secret|dl\.dropboxusercontent|X-Amz-Signature|sig=)/i

/**
 * The behaviour every photo source must exhibit, regardless of provider.
 *
 * Device, Google Photos, and Dropbox all feed the same ingestion workflow, so a
 * divergence here becomes a divergence in what customers can import. Each
 * adapter calls this from its own test file.
 */
export function runPhotoSourceAdapterContract(options: AdapterContractOptions): void {
  describe(`PhotoSourceAdapter contract: ${options.sourceType}`, () => {
    it("reports its own source type and stamps it on every item", async () => {
      const harness = await options.createHarness()
      expect(harness.adapter.sourceType).toBe(options.sourceType)

      const started = await start(harness)
      const items = await harness.adapter.listSelectedItems(started.importSessionId)

      expect(items.length).toBeGreaterThan(0)
      for (const item of items) {
        expect(item.sourceType).toBe(options.sourceType)
        expect(item.providerSessionId).toBe(started.importSessionId)
      }
    })

    it("issues idempotency keys that are stable across repeated listing", async () => {
      const harness = await options.createHarness()
      const started = await start(harness)

      const first = await harness.adapter.listSelectedItems(started.importSessionId)
      const second = await harness.adapter.listSelectedItems(started.importSessionId)

      expect(second.map((item) => item.idempotencyKey)).toEqual(
        first.map((item) => item.idempotencyKey),
      )
    })

    it("issues one distinct idempotency key per item", async () => {
      const harness = await options.createHarness()
      const started = await start(harness)
      const items = await harness.adapter.listSelectedItems(started.importSessionId)
      const keys = items.map((item) => item.idempotencyKey)

      expect(new Set(keys).size).toBe(keys.length)
      for (const key of keys) {
        expect(key.trim().length).toBeGreaterThan(0)
      }
    })

    it("never returns a provider credential in a session or item DTO", async () => {
      const harness = await options.createHarness()
      const started = await start(harness)
      const items = await harness.adapter.listSelectedItems(started.importSessionId)

      // A redirect URL legitimately carries an OAuth request; item DTOs never do.
      const sessionSurface = JSON.stringify({
        importSessionId: started.importSessionId,
        expiresAt: started.expiresAt,
        kind: started.customerAction.kind,
      })

      expect(sessionSurface).not.toMatch(secretPattern)
      expect(JSON.stringify(items)).not.toMatch(secretPattern)
    })

    it("returns an ISO-8601 expiry the caller can compare", async () => {
      const harness = await options.createHarness()
      const started = await start(harness)

      expect(Number.isFinite(Date.parse(started.expiresAt))).toBe(true)
    })

    it("aborts an in-flight item stream when the signal fires", async () => {
      const harness = await options.createHarness()
      const started = await start(harness)
      const [item] = await harness.adapter.listSelectedItems(started.importSessionId)
      const controller = new AbortController()

      const stream = await harness.adapter.openItemStream({
        importSessionId: started.importSessionId,
        item,
        signal: controller.signal,
      })
      const reader = stream.getReader()
      controller.abort()

      await expect(drain(reader)).rejects.toBeDefined()
    })

    it("rejects an unknown item rather than streaming something else", async () => {
      const harness = await options.createHarness()
      const started = await start(harness)
      const [item] = await harness.adapter.listSelectedItems(started.importSessionId)

      await expect(
        harness.adapter.openItemStream({
          importSessionId: started.importSessionId,
          item: { ...item, providerItemId: "does-not-exist" },
          signal: new AbortController().signal,
        }),
      ).rejects.toBeInstanceOf(PhotoSourceError)
    })

    it("tolerates dispose being called more than once", async () => {
      const harness = await options.createHarness()
      const started = await start(harness)

      await harness.adapter.dispose(started.importSessionId)
      await expect(harness.adapter.dispose(started.importSessionId)).resolves.toBeUndefined()
    })

    it("refuses to serve items once the session has expired", async () => {
      const harness = await options.createHarness()
      const started = await start(harness)
      await harness.expireSession(started.importSessionId)

      await expect(
        harness.adapter.listSelectedItems(started.importSessionId),
      ).rejects.toBeInstanceOf(PhotoSourceError)
    })

    it("rejects a session id it never issued", async () => {
      const harness = await options.createHarness()

      await expect(
        harness.adapter.listSelectedItems("not-a-session"),
      ).rejects.toBeInstanceOf(PhotoSourceError)
    })
  })

  function start(harness: AdapterContractHarness) {
    return harness.adapter.startSelection({
      photoJobId: harness.photoJobId,
      ownerKey: harness.ownerKey,
      locale: "en",
      idempotencyKey: "contract-idempotency-key",
    })
  }
}

async function drain(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  for (;;) {
    const { done } = await reader.read()
    if (done) return
  }
}
