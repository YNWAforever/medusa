import type { PhotoObjectRef } from "../photo-storage/types"
import {
  PhotoSourceError,
  sourceIdempotencyKey,
  type NormalizedPhotoSourceItem,
  type PhotoSourceAdapter,
  type SourceSessionStart,
} from "./types"

const DEVICE_SESSION_PREFIX = "devsrc_"
const DEFAULT_SESSION_TTL_SECONDS = 15 * 60

/** The Phase 2B asset fields this adapter needs. */
export interface DevicePhotoAssetRecord {
  id: string
  display_name: string
  object_key: string | null
  storage_provider?: string | null
  reported_mime_type?: string | null
  detected_mime_type?: string | null
  expected_bytes?: number | null
  stored_bytes?: number | null
  status: string
}

export interface PhotoSourceSessionRecord {
  id: string
  photoJobId: string
  ownerKey: string
  expiresAt: Date
}

/**
 * Seam for session persistence. Task 1 ships an in-memory implementation for
 * tests; Step 3 replaces it with the import-session table without touching
 * adapter code.
 */
export interface PhotoSourceSessionStore {
  put(session: PhotoSourceSessionRecord): Promise<void>
  get(id: string): Promise<PhotoSourceSessionRecord | null>
  delete(id: string): Promise<void>
}

export class InMemoryPhotoSourceSessionStore implements PhotoSourceSessionStore {
  readonly #sessions = new Map<string, PhotoSourceSessionRecord>()

  async put(session: PhotoSourceSessionRecord): Promise<void> {
    this.#sessions.set(session.id, { ...session })
  }

  async get(id: string): Promise<PhotoSourceSessionRecord | null> {
    const session = this.#sessions.get(id)
    return session ? { ...session } : null
  }

  async delete(id: string): Promise<void> {
    this.#sessions.delete(id)
  }
}

export interface DeviceAdapterDependencies {
  sessions: PhotoSourceSessionStore
  listUploadedAssets(photoJobId: string): Promise<DevicePhotoAssetRecord[]>
  openObject(input: {
    ref: PhotoObjectRef
    signal: AbortSignal
  }): Promise<ReadableStream<Uint8Array>>
  sessionTtlSeconds?: number
  now?: () => Date
}

export function deviceImportSessionId(photoJobId: string): string {
  return `${DEVICE_SESSION_PREFIX}${photoJobId}`
}

export function devicePhotoJobId(importSessionId: string): string {
  if (!importSessionId.startsWith(DEVICE_SESSION_PREFIX)) {
    throw new PhotoSourceError("photo_source_session_not_found")
  }

  const photoJobId = importSessionId.slice(DEVICE_SESSION_PREFIX.length)
  if (!photoJobId.trim()) {
    throw new PhotoSourceError("photo_source_session_not_found")
  }

  return photoJobId
}

/**
 * Presents an already-completed Phase 2B private upload through the same
 * contract Google Photos and Dropbox use.
 *
 * The device picker runs entirely in the browser, so there is no provider
 * authorization to hold: `startSelection` asks the customer for nothing and
 * `dispose` has no credential to erase. The session id is derived from the job
 * rather than stored, because the bytes are already in Fotomax storage.
 */
export class DevicePhotoSourceAdapter implements PhotoSourceAdapter {
  readonly sourceType = "device" as const

  constructor(private readonly dependencies: DeviceAdapterDependencies) {}

  async startSelection(input: {
    photoJobId: string
    ownerKey: string
    locale: "en" | "zh-HK"
    idempotencyKey: string
  }): Promise<SourceSessionStart> {
    const now = this.#now()
    const ttl = this.dependencies.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS
    const expiresAt = new Date(now.getTime() + ttl * 1000)
    // Deterministic per job, so retrying selection reuses the session instead of
    // orphaning the previous one.
    const id = deviceImportSessionId(input.photoJobId)

    await this.dependencies.sessions.put({
      id,
      photoJobId: input.photoJobId,
      ownerKey: input.ownerKey,
      expiresAt,
    })

    return {
      importSessionId: id,
      expiresAt: expiresAt.toISOString(),
      customerAction: { kind: "none" },
    }
  }

  async listSelectedItems(
    importSessionId: string,
  ): Promise<NormalizedPhotoSourceItem[]> {
    const { photoJobId } = await this.#requireActiveSession(importSessionId)
    const assets = await this.dependencies.listUploadedAssets(photoJobId)

    return assets
      .filter((asset) => isRetrievable(asset))
      .map((asset) => ({
        sourceType: this.sourceType,
        providerSessionId: importSessionId,
        providerItemId: asset.id,
        displayFilename: asset.display_name,
        reportedMediaType: asset.detected_mime_type ?? asset.reported_mime_type ?? null,
        expectedBytes: asset.stored_bytes ?? asset.expected_bytes ?? null,
        idempotencyKey: sourceIdempotencyKey({
          sourceType: this.sourceType,
          photoJobId,
          providerSessionId: importSessionId,
          providerItemId: asset.id,
        }),
        // Fotomax already owns these bytes, so retrieval never expires.
        retrievalExpiresAt: null,
      }))
  }

  async openItemStream(input: {
    importSessionId: string
    item: NormalizedPhotoSourceItem
    signal: AbortSignal
  }): Promise<ReadableStream<Uint8Array>> {
    const { photoJobId } = await this.#requireActiveSession(input.importSessionId)
    const assets = await this.dependencies.listUploadedAssets(photoJobId)
    const asset = assets.find((candidate) => candidate.id === input.item.providerItemId)

    if (!asset || !isRetrievable(asset)) {
      throw new PhotoSourceError("photo_source_item_not_found")
    }

    return this.dependencies.openObject({
      ref: {
        provider: storageProvider(asset),
        key: asset.object_key as string,
      },
      signal: input.signal,
    })
  }

  async dispose(importSessionId: string): Promise<void> {
    // There is no provider credential to erase; dropping the session record is
    // the whole of it, and deleting an absent record is not an error.
    await this.dependencies.sessions.delete(importSessionId)
  }

  async #requireActiveSession(importSessionId: string): Promise<PhotoSourceSessionRecord> {
    const session = await this.dependencies.sessions.get(importSessionId)

    if (!session) {
      throw new PhotoSourceError("photo_source_session_not_found")
    }

    if (session.expiresAt.getTime() <= this.#now().getTime()) {
      throw new PhotoSourceError("photo_source_session_expired")
    }

    return session
  }

  #now(): Date {
    return this.dependencies.now?.() ?? new Date()
  }
}

function isRetrievable(asset: DevicePhotoAssetRecord): boolean {
  return (
    typeof asset.object_key === "string" &&
    asset.object_key.length > 0 &&
    asset.status !== "deleted" &&
    asset.status !== "pending"
  )
}

function storageProvider(asset: DevicePhotoAssetRecord): "s3" | "vercel-blob" {
  const provider = asset.storage_provider ?? "s3"

  if (provider !== "s3" && provider !== "vercel-blob") {
    throw new PhotoSourceError("photo_source_unavailable")
  }

  return provider
}
