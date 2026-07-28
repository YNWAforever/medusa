import { PassThrough } from "node:stream"
import { randomUUID } from "node:crypto"

import {
  DEFAULT_IDLE_TIMEOUT_MS,
  MAX_INGEST_BYTES,
  copyPhotoStream,
} from "../modules/photo-sources/ingest-stream"
import {
  PhotoSourceError,
  type NormalizedPhotoSourceItem,
  type PhotoSourceAdapter,
} from "../modules/photo-sources/types"
import { photoObjectRef, type PhotoObjectStorage } from "../modules/photo-storage/types"

export type IngestFailureCode = string

export type IngestOutcome =
  | {
    status: "imported"
    assetId: string
    bytes: number
    sha256: string
    crc32c: string
  }
  | { status: "duplicate"; assetId: string }
  | { status: "failed"; assetId: string | null; code: IngestFailureCode }

export interface ImportSessionRecord {
  id: string
  job_id: string
  source_type: string
  selection_state: string
  selected_count: number
  imported_count: number
  failed_count: number
  expires_at: Date | string
  credentials_ciphertext?: string | null
  credentials_cleared_at?: Date | string | null
}

export interface IngestDependencies {
  service: {
    retrievePhotoImportSession(id: string): Promise<ImportSessionRecord | null>
    updatePhotoImportSessions(input: unknown): Promise<unknown>
    retrievePhotoJob(id: string): Promise<Record<string, any> | null>
    listPhotoAssets(filter: Record<string, unknown>): Promise<Array<Record<string, any>>>
    createPhotoAssets(data: Record<string, unknown>): Promise<Record<string, any>>
    updatePhotoAssets(input: unknown): Promise<unknown>
  }
  storage: Pick<PhotoObjectStorage, "writeOriginal" | "inspect" | "delete" | "defaultProvider">
  adapter: PhotoSourceAdapter
  eventBus?: { emit(input: { name: string; data: unknown }): Promise<void> | void }
  /** Owner check, shared with the Phase 2B routes. */
  ownsJob(job: Record<string, any>, ownerKey: string): boolean
  newObjectKey?: () => string
  now?: () => Date
  maxBytes?: number
  idleTimeoutMs?: number
}

export interface IngestInput {
  importSessionId: string
  item: NormalizedPhotoSourceItem
  ownerKey: string
  signal?: AbortSignal
}

/** Unguessable, and never derived from the job id. */
function defaultObjectKey(): string {
  return `photo-jobs/${randomUUID()}/originals/${randomUUID()}`
}

/**
 * Copies one selected provider item into Fotomax private storage.
 *
 * Provider-neutral by construction: it receives an opaque byte stream from the
 * adapter, so device, Google Photos, and Dropbox all converge here and every
 * item lands in the same Phase 2B processing pipeline.
 *
 * The bytes are never buffered. The adapter's stream is measured and bounded on
 * the way through while being written straight to storage, so an oversized or
 * stalled provider is cut off mid-transfer rather than after arrival.
 */
export async function ingestPhotoSourceItem(
  dependencies: IngestDependencies,
  input: IngestInput,
): Promise<IngestOutcome> {
  const now = dependencies.now ?? (() => new Date())
  const session = await dependencies.service.retrievePhotoImportSession(
    input.importSessionId,
  )

  if (!session) {
    throw new PhotoSourceError("photo_source_session_not_found")
  }
  if (session.selection_state === "cancelled" || session.selection_state === "expired") {
    throw new PhotoSourceError("photo_source_session_expired")
  }
  if (new Date(session.expires_at).getTime() <= now().getTime()) {
    throw new PhotoSourceError("photo_source_session_expired")
  }

  const job = await dependencies.service.retrievePhotoJob(session.job_id)
  if (!job || !dependencies.ownsJob(job, input.ownerKey)) {
    // Same code whether the job is absent or someone else's, so probing cannot
    // distinguish the two.
    throw new PhotoSourceError("photo_source_session_not_found")
  }

  // Idempotency: a retried import must not create a second asset.
  const existing = await dependencies.service.listPhotoAssets({
    job_id: session.job_id,
    source_idempotency_key: input.item.idempotencyKey,
  })
  if (existing.length > 0) {
    return { status: "duplicate", assetId: existing[0].id }
  }

  const provider = dependencies.storage.defaultProvider
  const objectKey = (dependencies.newObjectKey ?? defaultObjectKey)()
  const asset = await dependencies.service.createPhotoAssets({
    job_id: session.job_id,
    display_name: input.item.displayFilename,
    object_key: objectKey,
    storage_provider: provider,
    reported_mime_type: input.item.reportedMediaType,
    expected_bytes: input.item.expectedBytes ?? 0,
    source_idempotency_key: input.item.idempotencyKey,
    status: "uploading",
    upload_started_at: now(),
  })

  const ref = photoObjectRef({ storage_provider: provider }, objectKey)

  try {
    const source = await dependencies.adapter.openItemStream({
      importSessionId: input.importSessionId,
      item: input.item,
      signal: input.signal ?? new AbortController().signal,
    })

    const measured = await pipeToStorage({
      source,
      write: (body) =>
        dependencies.storage.writeOriginal({
          ref,
          body,
          contentType: input.item.reportedMediaType ?? "application/octet-stream",
        }),
      maxBytes: dependencies.maxBytes ?? MAX_INGEST_BYTES,
      idleTimeoutMs: dependencies.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      expectedBytes: input.item.expectedBytes,
      signal: input.signal,
    })

    // Trust the provider's own view of what landed, not our byte count.
    const stored = await dependencies.storage.inspect(ref)

    await dependencies.service.updatePhotoAssets({
      selector: { id: asset.id },
      data: {
        status: "uploaded",
        stored_bytes: stored.bytes,
        provider_etag: stored.etag,
        sha256: measured.sha256,
        crc32c: measured.crc32c,
        uploaded_at: now(),
        last_activity_at: now(),
      },
    })

    await dependencies.eventBus?.emit({
      name: "photo_asset.uploaded",
      data: { asset_id: asset.id },
    })

    await settleSession(dependencies, session, { imported: 1 })

    return {
      status: "imported",
      assetId: asset.id,
      bytes: measured.bytes,
      sha256: measured.sha256,
      crc32c: measured.crc32c,
    }
  } catch (error) {
    const code = failureCode(error)

    // A partial object is unreferenced the moment the asset is marked failed;
    // remove it rather than leave billable bytes behind.
    await dependencies.storage.delete([ref]).catch(() => {})
    await dependencies.service
      .updatePhotoAssets({
        selector: { id: asset.id },
        data: {
          status: "failed",
          object_key: null,
          failure_code: code.slice(0, 120),
          failed_at: now(),
        },
      })
      .catch(() => {})
    await settleSession(dependencies, session, { failed: 1 })

    return { status: "failed", assetId: asset.id, code }
  }
}

/**
 * Bridges the measured reader to the storage writer.
 *
 * `copyPhotoStream` pushes chunks; `writeOriginal` wants a Readable. A
 * PassThrough joins them so both run concurrently and nothing accumulates —
 * writes respect backpressure, so a slow provider cannot outrun storage.
 */
async function pipeToStorage(input: {
  source: ReadableStream<Uint8Array>
  write(body: PassThrough): Promise<{ etag: string }>
  maxBytes: number
  idleTimeoutMs: number
  expectedBytes: number | null
  signal?: AbortSignal
}) {
  const body = new PassThrough()
  const written = input.write(body)
  // Nothing awaits this until the end; without a handler a storage failure
  // would surface as an unhandled rejection while the copy is still running.
  written.catch(() => {})

  try {
    const measured = await copyPhotoStream({
      source: input.source,
      maxBytes: input.maxBytes,
      idleTimeoutMs: input.idleTimeoutMs,
      expectedBytes: input.expectedBytes,
      signal: input.signal,
      async sink(chunk) {
        if (!body.write(chunk)) {
          await new Promise<void>((resolve, reject) => {
            body.once("drain", resolve)
            body.once("error", reject)
          })
        }
      },
    })

    body.end()
    await written
    return measured
  } catch (error) {
    body.destroy(error instanceof Error ? error : new Error(String(error)))
    await written.catch(() => {})
    throw error
  }
}

function failureCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === "string" && code.trim()) return code
  }
  return "photo_source_import_failed"
}

/**
 * Advances the session counters and erases the provider credential once every
 * selected item has reached a terminal state. The credential must not outlive
 * the import that needed it.
 */
async function settleSession(
  dependencies: IngestDependencies,
  session: ImportSessionRecord,
  delta: { imported?: number; failed?: number },
): Promise<void> {
  const now = dependencies.now ?? (() => new Date())
  const imported = session.imported_count + (delta.imported ?? 0)
  const failed = session.failed_count + (delta.failed ?? 0)
  const finished = session.selected_count > 0 && imported + failed >= session.selected_count

  const data: Record<string, unknown> = {
    imported_count: imported,
    failed_count: failed,
    selection_state: finished ? "completed" : "importing",
  }

  if (finished) {
    data.completed_at = now()
    data.credentials_ciphertext = null
    data.credentials_key_version = null
    data.credentials_cleared_at = now()
  }

  await dependencies.service.updatePhotoImportSessions({
    selector: { id: session.id },
    data,
  })

  if (finished) {
    await dependencies.adapter.dispose(session.id).catch(() => {})
  }
}
