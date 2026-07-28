import { createHash } from "node:crypto"
import type { PassThrough } from "node:stream"
import { describe, expect, it, vi } from "vitest"

import { Crc32c } from "../modules/photo-sources/crc32c"
import { PhotoSourceError, type NormalizedPhotoSourceItem } from "../modules/photo-sources/types"
import { ingestPhotoSourceItem, type IngestDependencies } from "./ingest-photo-source-item"

const objectKey =
  "photo-jobs/123e4567-e89b-42d3-a456-426614174000/originals/123e4567-e89b-42d3-a456-426614174001"

const payload = Buffer.from("provider-photo-bytes")

const item: NormalizedPhotoSourceItem = {
  sourceType: "google_photos",
  providerSessionId: "phimp_1",
  providerItemId: "g-1",
  displayFilename: "harbour.jpg",
  reportedMediaType: "image/jpeg",
  expectedBytes: payload.length,
  idempotencyKey: "google_photos:phjob_1:phimp_1:g-1",
  retrievalExpiresAt: null,
}

function streamOf(chunks: Buffer[]): ReadableStream<Uint8Array> {
  const queue = [...chunks]
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = queue.shift()
      if (!next) {
        controller.close()
        return
      }
      controller.enqueue(new Uint8Array(next))
    },
  })
}

function setup(overrides: {
  session?: Partial<Record<string, unknown>>
  existingAssets?: Array<Record<string, any>>
  source?: () => ReadableStream<Uint8Array>
  owns?: boolean
  inspect?: () => Promise<{ bytes: number; contentType: string; etag: string }>
} = {}) {
  const session = {
    id: "phimp_1",
    job_id: "phjob_1",
    source_type: "google_photos",
    selection_state: "selected",
    selected_count: 1,
    imported_count: 0,
    failed_count: 0,
    expires_at: new Date(Date.now() + 600_000),
    credentials_ciphertext: "v1.sealed",
    credentials_cleared_at: null,
    ...overrides.session,
  }

  const written: Buffer[] = []
  const updatePhotoAssets = vi.fn(async () => undefined)
  const updatePhotoImportSessions = vi.fn(async () => undefined)
  const emit = vi.fn(async () => undefined)
  const del = vi.fn(async () => undefined)
  const dispose = vi.fn(async () => undefined)

  const dependencies: IngestDependencies = {
    service: {
      retrievePhotoImportSession: vi.fn(async () => session as never),
      updatePhotoImportSessions,
      retrievePhotoJob: vi.fn(async () => ({ id: "phjob_1", guest_owner_hash: "abc" })),
      listPhotoAssets: vi.fn(async () => overrides.existingAssets ?? []),
      createPhotoAssets: vi.fn(async (data: Record<string, unknown>) => ({
        id: "phast_new",
        ...data,
      })),
      updatePhotoAssets,
    },
    storage: {
      defaultProvider: "s3",
      writeOriginal: vi.fn(async ({ body }: { body: PassThrough }) => {
        for await (const chunk of body) written.push(Buffer.from(chunk as Uint8Array))
        return { etag: '"stored-etag"' }
      }),
      inspect:
        overrides.inspect ??
        vi.fn(async () => ({
          bytes: payload.length,
          contentType: "image/jpeg",
          etag: '"stored-etag"',
        })),
      delete: del,
    } as never,
    adapter: {
      sourceType: "google_photos",
      startSelection: vi.fn(),
      listSelectedItems: vi.fn(),
      openItemStream: vi.fn(async () =>
        (overrides.source ?? (() => streamOf([payload])))(),
      ),
      dispose,
    } as never,
    eventBus: { emit },
    ownsJob: () => overrides.owns ?? true,
    newObjectKey: () => objectKey,
  }

  return { dependencies, written, updatePhotoAssets, updatePhotoImportSessions, emit, del, dispose, session }
}

const input = { importSessionId: "phimp_1", item, ownerKey: "guest:abc" }

describe("ingestPhotoSourceItem", () => {
  it("copies provider bytes into private storage and records both digests", async () => {
    const { dependencies, written, updatePhotoAssets, emit } = setup()

    const result = await ingestPhotoSourceItem(dependencies, input)

    expect(result).toMatchObject({
      status: "imported",
      assetId: "phast_new",
      bytes: payload.length,
      sha256: createHash("sha256").update(payload).digest("hex"),
      crc32c: new Crc32c().update(payload).base64(),
    })
    expect(Buffer.concat(written).equals(payload)).toBe(true)
    expect(updatePhotoAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "uploaded", provider_etag: '"stored-etag"' }),
      }),
    )
    expect(emit).toHaveBeenCalledWith({
      name: "photo_asset.uploaded",
      data: { asset_id: "phast_new" },
    })
  })

  it("writes to an unguessable key that is not derived from the job id", async () => {
    const { dependencies } = setup()
    dependencies.newObjectKey = undefined

    await ingestPhotoSourceItem(dependencies, input)

    const created = (dependencies.service.createPhotoAssets as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Record<string, string>
    expect(created.object_key).toMatch(
      /^photo-jobs\/[0-9a-f-]{36}\/originals\/[0-9a-f-]{36}$/,
    )
    expect(created.object_key).not.toContain("phjob_1")
  })

  it("returns the existing asset instead of importing the same item twice", async () => {
    const { dependencies, written } = setup({ existingAssets: [{ id: "phast_existing" }] })

    const result = await ingestPhotoSourceItem(dependencies, input)

    expect(result).toEqual({ status: "duplicate", assetId: "phast_existing" })
    expect(dependencies.service.createPhotoAssets).not.toHaveBeenCalled()
    expect(written).toHaveLength(0)
  })

  it("refuses an item for a job the caller does not own", async () => {
    const { dependencies } = setup({ owns: false })

    await expect(ingestPhotoSourceItem(dependencies, input)).rejects.toThrow(
      "photo_source_session_not_found",
    )
    expect(dependencies.service.createPhotoAssets).not.toHaveBeenCalled()
  })

  it.each(["cancelled", "expired"])("refuses a %s session", async (selection_state) => {
    const { dependencies } = setup({ session: { selection_state } })

    await expect(ingestPhotoSourceItem(dependencies, input)).rejects.toThrow(
      "photo_source_session_expired",
    )
  })

  it("refuses a session that has passed its expiry", async () => {
    const { dependencies } = setup({ session: { expires_at: new Date(Date.now() - 1000) } })

    await expect(ingestPhotoSourceItem(dependencies, input)).rejects.toBeInstanceOf(
      PhotoSourceError,
    )
  })

  it("refuses an unknown session", async () => {
    const { dependencies } = setup()
    dependencies.service.retrievePhotoImportSession = vi.fn(async () => null)

    await expect(ingestPhotoSourceItem(dependencies, input)).rejects.toThrow(
      "photo_source_session_not_found",
    )
  })

  it("cuts off a provider that exceeds the byte cap and leaves no stored object", async () => {
    const { dependencies, del, updatePhotoAssets } = setup({
      source: () => streamOf([Buffer.alloc(600), Buffer.alloc(600)]),
    })
    dependencies.maxBytes = 1000

    const result = await ingestPhotoSourceItem(dependencies, {
      ...input,
      item: { ...item, expectedBytes: null },
    })

    expect(result).toMatchObject({ status: "failed", code: "photo_source_too_large" })
    // The partial object must not be left behind billing storage.
    expect(del).toHaveBeenCalled()
    expect(updatePhotoAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed", object_key: null }),
      }),
    )
  })

  it("fails the asset when the provider truncates the transfer", async () => {
    const { dependencies } = setup({ source: () => streamOf([Buffer.alloc(3)]) })

    const result = await ingestPhotoSourceItem(dependencies, input)

    expect(result).toMatchObject({ status: "failed", code: "photo_source_size_mismatch" })
  })

  it("fails the asset when storage rejects the write", async () => {
    const { dependencies, del } = setup()
    dependencies.storage.writeOriginal = vi.fn(async () => {
      throw Object.assign(new Error("photo_storage_provider_unavailable"), {
        code: "photo_storage_provider_unavailable",
      })
    }) as never

    const result = await ingestPhotoSourceItem(dependencies, input)

    expect(result).toMatchObject({
      status: "failed",
      code: "photo_storage_provider_unavailable",
    })
    expect(del).toHaveBeenCalled()
  })

  it("does not emit the processing event for a failed import", async () => {
    const { dependencies, emit } = setup({ source: () => streamOf([Buffer.alloc(3)]) })

    await ingestPhotoSourceItem(dependencies, input)

    expect(emit).not.toHaveBeenCalled()
  })

  it("erases the provider credential once every selected item is terminal", async () => {
    const { dependencies, updatePhotoImportSessions, dispose } = setup()

    await ingestPhotoSourceItem(dependencies, input)

    expect(updatePhotoImportSessions).toHaveBeenCalledWith({
      selector: { id: "phimp_1" },
      data: expect.objectContaining({
        selection_state: "completed",
        imported_count: 1,
        credentials_ciphertext: null,
        credentials_key_version: null,
        credentials_cleared_at: expect.any(Date),
      }),
    })
    expect(dispose).toHaveBeenCalledWith("phimp_1")
  })

  it("keeps the credential while items remain outstanding", async () => {
    const { dependencies, updatePhotoImportSessions, dispose } = setup({
      session: { selected_count: 3 },
    })

    await ingestPhotoSourceItem(dependencies, input)

    const data = updatePhotoImportSessions.mock.calls[0][0].data as Record<string, unknown>
    expect(data.selection_state).toBe("importing")
    expect(data).not.toHaveProperty("credentials_cleared_at")
    expect(dispose).not.toHaveBeenCalled()
  })

  it("erases the credential even when the last item fails", async () => {
    const { dependencies, updatePhotoImportSessions } = setup({
      source: () => streamOf([Buffer.alloc(3)]),
    })

    await ingestPhotoSourceItem(dependencies, input)

    expect(updatePhotoImportSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failed_count: 1,
          selection_state: "completed",
          credentials_ciphertext: null,
        }),
      }),
    )
  })

  it("trusts the provider's stored byte count over its promised size", async () => {
    const { dependencies, updatePhotoAssets } = setup({
      inspect: vi.fn(async () => ({
        bytes: 4096,
        contentType: "image/jpeg",
        etag: '"stored-etag"',
      })),
    })

    await ingestPhotoSourceItem(dependencies, input)

    expect(updatePhotoAssets).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stored_bytes: 4096 }) }),
    )
  })
})
