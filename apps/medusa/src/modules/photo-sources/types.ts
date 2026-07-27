/**
 * The provider-neutral ingestion boundary.
 *
 * Device uploads, Google Photos, and Dropbox all normalize to the same item and
 * end in the same private processing workflow, so downstream code never learns
 * which provider a photo came from.
 */
export type PhotoSourceType = "device" | "google_photos" | "dropbox"

export interface NormalizedPhotoSourceItem {
  sourceType: PhotoSourceType
  providerSessionId: string
  providerItemId: string
  displayFilename: string
  reportedMediaType: string | null
  expectedBytes: number | null
  idempotencyKey: string
  retrievalExpiresAt: string | null
}

export interface SourceSessionStart {
  importSessionId: string
  expiresAt: string
  customerAction:
    | { kind: "none" }
    | { kind: "redirect"; url: string }
    | { kind: "chooser" }
}

export interface PhotoSourceAdapter {
  readonly sourceType: PhotoSourceType
  startSelection(input: {
    photoJobId: string
    ownerKey: string
    locale: "en" | "zh-HK"
    idempotencyKey: string
  }): Promise<SourceSessionStart>
  listSelectedItems(importSessionId: string): Promise<NormalizedPhotoSourceItem[]>
  openItemStream(input: {
    importSessionId: string
    item: NormalizedPhotoSourceItem
    signal: AbortSignal
  }): Promise<ReadableStream<Uint8Array>>
  dispose(importSessionId: string): Promise<void>
}

export type PhotoSourceErrorCode =
  | "photo_source_session_not_found"
  | "photo_source_session_expired"
  | "photo_source_item_not_found"
  | "photo_source_unavailable"
  | "photo_source_token_invalid"
  | "photo_source_token_expired"

export class PhotoSourceError extends Error {
  readonly code: PhotoSourceErrorCode

  constructor(code: PhotoSourceErrorCode) {
    super(code)
    this.name = "PhotoSourceError"
    this.code = code
  }
}

/**
 * Stable across retries of the same selection, so a re-run of an import cannot
 * create a second asset for the same provider item.
 */
export function sourceIdempotencyKey(input: {
  sourceType: PhotoSourceType
  photoJobId: string
  providerSessionId: string
  providerItemId: string
}): string {
  return [
    input.sourceType,
    input.photoJobId,
    input.providerSessionId,
    input.providerItemId,
  ].join(":")
}
