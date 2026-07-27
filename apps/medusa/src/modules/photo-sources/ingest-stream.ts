import { createHash } from "node:crypto"

import { Crc32c } from "./crc32c"

export const MAX_INGEST_BYTES = 50 * 1024 * 1024
export const DEFAULT_IDLE_TIMEOUT_MS = 30_000

export type PhotoIngestFailureCode =
  | "photo_source_too_large"
  | "photo_source_stalled"
  | "photo_source_aborted"
  | "photo_source_size_mismatch"

export class PhotoIngestError extends Error {
  readonly code: PhotoIngestFailureCode

  constructor(code: PhotoIngestFailureCode) {
    super(code)
    this.name = "PhotoIngestError"
    this.code = code
  }
}

export interface PhotoIngestResult {
  bytes: number
  /** Hex, for the PhotoAsset row. */
  sha256: string
  /** Base64 big-endian, the encoding S3 expects. */
  crc32c: string
}

export interface CopyPhotoStreamInput {
  source: ReadableStream<Uint8Array>
  sink(chunk: Uint8Array): Promise<void> | void
  maxBytes?: number
  idleTimeoutMs?: number
  /** When the provider states a size, a mismatch means a truncated transfer. */
  expectedBytes?: number | null
  signal?: AbortSignal
}

/**
 * Streams provider bytes into a sink while measuring them.
 *
 * Never buffers the whole file: chunks are hashed and handed straight on. The
 * byte cap is enforced mid-stream rather than after the fact, so an oversized or
 * lying provider is cut off instead of being allowed to fill memory or storage.
 * A stalled connection trips the idle timeout — a provider that stops sending
 * without closing would otherwise hold the import open indefinitely.
 */
export async function copyPhotoStream(
  input: CopyPhotoStreamInput,
): Promise<PhotoIngestResult> {
  const maxBytes = input.maxBytes ?? MAX_INGEST_BYTES
  const idleTimeoutMs = input.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS

  if (maxBytes <= 0) {
    throw new PhotoIngestError("photo_source_too_large")
  }

  const sha256 = createHash("sha256")
  const checksum = new Crc32c()
  const reader = input.source.getReader()

  let bytes = 0
  let abortListener: (() => void) | undefined
  const abortSignal = input.signal

  const aborted = new Promise<never>((_resolve, reject) => {
    if (!abortSignal) return
    if (abortSignal.aborted) {
      reject(new PhotoIngestError("photo_source_aborted"))
      return
    }
    abortListener = () => reject(new PhotoIngestError("photo_source_aborted"))
    abortSignal.addEventListener("abort", abortListener, { once: true })
  })
  // Nothing awaits this until the race below; without a no-op handler an early
  // abort would surface as an unhandled rejection.
  aborted.catch(() => {})

  try {
    for (;;) {
      // Checked explicitly rather than left to the race below: when the provider
      // already has a chunk queued, `reader.read()` resolves in an earlier
      // microtask than the abort rejection propagates and the race keeps
      // choosing the read. A fast stream would then run to the byte cap instead
      // of stopping.
      if (abortSignal?.aborted) {
        throw new PhotoIngestError("photo_source_aborted")
      }

      const result = await readChunk(reader, idleTimeoutMs, aborted)

      if (result.done) break

      const chunk = result.value
      if (!chunk || chunk.length === 0) continue

      bytes += chunk.length
      if (bytes > maxBytes) {
        throw new PhotoIngestError("photo_source_too_large")
      }

      sha256.update(chunk)
      checksum.update(chunk)
      await input.sink(chunk)
    }

    if (
      typeof input.expectedBytes === "number" &&
      Number.isFinite(input.expectedBytes) &&
      input.expectedBytes >= 0 &&
      input.expectedBytes !== bytes
    ) {
      throw new PhotoIngestError("photo_source_size_mismatch")
    }

    return { bytes, sha256: sha256.digest("hex"), crc32c: checksum.base64() }
  } catch (error) {
    // Close the provider connection rather than leaving it draining.
    await reader.cancel().catch(() => {})
    throw error
  } finally {
    if (abortSignal && abortListener) {
      abortSignal.removeEventListener("abort", abortListener)
    }
    reader.releaseLock?.()
  }
}

async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  idleTimeoutMs: number,
  aborted: Promise<never>,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined

  const idle = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new PhotoIngestError("photo_source_stalled")),
      idleTimeoutMs,
    )
  })
  idle.catch(() => {})

  try {
    return await Promise.race([reader.read(), idle, aborted])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
