import { describe, expect, it, vi } from "vitest"

import { runPhotoSourceAdapterContract } from "./contract-tests"
import {
  DevicePhotoSourceAdapter,
  InMemoryPhotoSourceSessionStore,
  deviceImportSessionId,
  type DevicePhotoAssetRecord,
} from "./device-adapter"
import { PhotoSourceError } from "./types"

const photoJobId = "phjob_123"
const ownerKey = "guest:abc"

function assets(): DevicePhotoAssetRecord[] {
  return [
    {
      id: "phast_1",
      display_name: "beach.jpg",
      object_key: "photo-jobs/a/originals/1",
      storage_provider: "s3",
      reported_mime_type: "image/jpeg",
      detected_mime_type: "image/jpeg",
      expected_bytes: 1024,
      stored_bytes: 1024,
      status: "ready",
    },
    {
      id: "phast_2",
      display_name: "harbour.heic",
      object_key: "photo-jobs/a/originals/2",
      storage_provider: "vercel-blob",
      reported_mime_type: "image/heic",
      detected_mime_type: null,
      expected_bytes: 2048,
      stored_bytes: null,
      status: "uploaded",
    },
  ]
}

function streamOf(chunks: Uint8Array[], signal: AbortSignal): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (signal.aborted) {
        controller.error(new Error("aborted"))
        return
      }
      const next = chunks.shift()
      if (!next) {
        controller.close()
        return
      }
      controller.enqueue(next)
    },
  })
}

function createAdapter(overrides: {
  records?: DevicePhotoAssetRecord[]
  now?: () => Date
} = {}) {
  const sessions = new InMemoryPhotoSourceSessionStore()
  const records = overrides.records ?? assets()
  const openObject = vi.fn(
    async ({ signal }: { signal: AbortSignal }) =>
      streamOf([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])], signal),
  )
  const listUploadedAssets = vi.fn(async () => records)

  const adapter = new DevicePhotoSourceAdapter({
    sessions,
    listUploadedAssets,
    openObject,
    now: overrides.now,
  })

  return { adapter, sessions, openObject, listUploadedAssets }
}

runPhotoSourceAdapterContract({
  sourceType: "device",
  createHarness() {
    const { adapter, sessions } = createAdapter()

    return {
      adapter,
      photoJobId,
      ownerKey,
      async expireSession(importSessionId) {
        const session = await sessions.get(importSessionId)
        if (session) {
          await sessions.put({ ...session, expiresAt: new Date(Date.now() - 1000) })
        }
      },
    }
  },
})

describe("DevicePhotoSourceAdapter", () => {
  it("asks the customer for nothing, because the picker is client-side", async () => {
    const { adapter } = createAdapter()

    const started = await adapter.startSelection({
      photoJobId,
      ownerKey,
      locale: "zh-HK",
      idempotencyKey: "k1",
    })

    expect(started.customerAction).toEqual({ kind: "none" })
    expect(started.importSessionId).toBe(deviceImportSessionId(photoJobId))
  })

  it("reuses the session when selection is retried for the same job", async () => {
    const { adapter } = createAdapter()

    const first = await adapter.startSelection({ photoJobId, ownerKey, locale: "en", idempotencyKey: "k1" })
    const second = await adapter.startSelection({ photoJobId, ownerKey, locale: "en", idempotencyKey: "k2" })

    expect(second.importSessionId).toBe(first.importSessionId)
  })

  it("uses the Phase 2B asset id as the provider item id", async () => {
    const { adapter } = createAdapter()
    const started = await adapter.startSelection({ photoJobId, ownerKey, locale: "en", idempotencyKey: "k1" })

    const items = await adapter.listSelectedItems(started.importSessionId)

    expect(items.map((item) => item.providerItemId)).toEqual(["phast_1", "phast_2"])
    expect(items[0].retrievalExpiresAt).toBeNull()
  })

  it("prefers the detected media type and stored size over the reported ones", async () => {
    const { adapter } = createAdapter()
    const started = await adapter.startSelection({ photoJobId, ownerKey, locale: "en", idempotencyKey: "k1" })

    const [first, second] = await adapter.listSelectedItems(started.importSessionId)

    expect(first).toMatchObject({ reportedMediaType: "image/jpeg", expectedBytes: 1024 })
    // No detected type or stored size yet, so it falls back to what was reported.
    expect(second).toMatchObject({ reportedMediaType: "image/heic", expectedBytes: 2048 })
  })

  it.each([
    ["a deleted asset", { status: "deleted" }],
    ["an asset whose media was purged", { object_key: null }],
    ["an upload that never completed", { status: "pending" }],
  ])("omits %s from the selection", async (_label, override) => {
    const records = assets().map((asset, index) =>
      index === 0 ? { ...asset, ...override } : asset,
    )
    const { adapter } = createAdapter({ records })
    const started = await adapter.startSelection({ photoJobId, ownerKey, locale: "en", idempotencyKey: "k1" })

    const items = await adapter.listSelectedItems(started.importSessionId)

    expect(items.map((item) => item.providerItemId)).toEqual(["phast_2"])
  })

  it("opens the original through the asset's own storage provider", async () => {
    const { adapter, openObject } = createAdapter()
    const started = await adapter.startSelection({ photoJobId, ownerKey, locale: "en", idempotencyKey: "k1" })
    const items = await adapter.listSelectedItems(started.importSessionId)

    await adapter.openItemStream({
      importSessionId: started.importSessionId,
      item: items[1],
      signal: new AbortController().signal,
    })

    expect(openObject).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: { provider: "vercel-blob", key: "photo-jobs/a/originals/2" },
      }),
    )
  })

  it("refuses to stream an asset that was deleted after listing", async () => {
    const records = assets()
    const { adapter } = createAdapter({ records })
    const started = await adapter.startSelection({ photoJobId, ownerKey, locale: "en", idempotencyKey: "k1" })
    const items = await adapter.listSelectedItems(started.importSessionId)
    records[0].status = "deleted"

    await expect(
      adapter.openItemStream({
        importSessionId: started.importSessionId,
        item: items[0],
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("photo_source_item_not_found")
  })

  it("rejects an unrecognized storage provider rather than guessing", async () => {
    const records = assets().map((asset) => ({ ...asset, storage_provider: "ftp" }))
    const { adapter } = createAdapter({ records })
    const started = await adapter.startSelection({ photoJobId, ownerKey, locale: "en", idempotencyKey: "k1" })
    const items = await adapter.listSelectedItems(started.importSessionId)

    await expect(
      adapter.openItemStream({
        importSessionId: started.importSessionId,
        item: items[0],
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(PhotoSourceError)
  })

  it("drops the session on dispose so a later listing is rejected", async () => {
    const { adapter } = createAdapter()
    const started = await adapter.startSelection({ photoJobId, ownerKey, locale: "en", idempotencyKey: "k1" })

    await adapter.dispose(started.importSessionId)

    await expect(adapter.listSelectedItems(started.importSessionId)).rejects.toThrow(
      "photo_source_session_not_found",
    )
  })
})
