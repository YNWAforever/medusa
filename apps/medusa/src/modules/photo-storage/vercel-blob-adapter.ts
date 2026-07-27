import { Readable } from "node:stream"
import type { ReadableStream as NodeReadableStream } from "node:stream/web"
import {
  BlobNotFoundError,
  del,
  get,
  head,
  issueSignedToken,
  presignUrl,
  put,
} from "@vercel/blob"
import {
  PhotoStorageError,
  type PhotoDirectUploadGrant,
  type PhotoObjectInfo,
  type PhotoStorageAdapter,
} from "./types"

const ORIGINAL_KEY_PATTERN = /^photo-jobs\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/originals\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PREVIEW_KEY_PATTERN = /^photo-jobs\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/previews\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i
const MAX_UPLOAD_SIGNATURE_SECONDS = 900
const MAX_READ_SIGNATURE_SECONDS = 300
const MAX_PREFIX_BYTES = 64
const MAX_DIRECT_UPLOAD_BYTES = 50 * 1024 * 1024

export type BlobApi = {
  issueSignedToken: typeof issueSignedToken
  presignUrl: typeof presignUrl
  head: typeof head
  get: typeof get
  put: typeof put
  del: typeof del
}

const defaultBlobApi: BlobApi = {
  issueSignedToken,
  presignUrl,
  head,
  get,
  put,
  del,
}

function validateKey(key: string): void {
  if (!ORIGINAL_KEY_PATTERN.test(key) && !PREVIEW_KEY_PATTERN.test(key)) {
    throw new PhotoStorageError("photo_storage_invalid_key")
  }
}

function validatePreviewKey(key: string): void {
  validateKey(key)
  if (!PREVIEW_KEY_PATTERN.test(key)) {
    throw new PhotoStorageError("photo_storage_invalid_key")
  }
}

function validateExpiry(expiresIn: number, maximum: number): void {
  if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > maximum) {
    throw new PhotoStorageError("photo_storage_invalid_expiry")
  }
}

function validateDirectUploadBytes(bytes: number): void {
  if (
    !Number.isInteger(bytes)
    || bytes < 1
    || bytes > MAX_DIRECT_UPLOAD_BYTES
  ) {
    throw new PhotoStorageError("photo_storage_invalid_size")
  }
}

function validatePrefix(maxBytes: number): void {
  if (
    !Number.isInteger(maxBytes)
    || maxBytes < 1
    || maxBytes > MAX_PREFIX_BYTES
  ) {
    throw new PhotoStorageError("photo_storage_invalid_range")
  }
}

function providerError(): PhotoStorageError {
  return new PhotoStorageError("photo_storage_provider_error")
}

function notFoundError(): PhotoStorageError {
  return new PhotoStorageError("photo_storage_not_found")
}

function validateMetadata(
  key: string,
  metadata: {
    pathname?: string
    size?: number | null
    contentType?: string | null
    etag?: string
  },
): asserts metadata is {
  pathname: string
  size: number
  contentType: string
  etag: string
} {
  if (
    metadata.pathname !== key
    || !Number.isInteger(metadata.size)
    || (metadata.size ?? -1) < 0
    || !metadata.contentType
    || !metadata.etag
  ) {
    throw providerError()
  }
}

function mapProviderError(error: unknown): never {
  if (error instanceof PhotoStorageError) throw error
  if (error instanceof BlobNotFoundError) throw notFoundError()
  throw providerError()
}

function toNodeReadable(stream: ReadableStream<Uint8Array>): Readable {
  return Readable.fromWeb(
    stream as unknown as NodeReadableStream<Uint8Array>,
  )
}

async function readBounded(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array> {
  const readable = toNodeReadable(stream)
  const chunks: Buffer[] = []
  let remaining = maxBytes
  for await (const chunk of readable) {
    if (remaining === 0) break
    const bytes = Buffer.from(chunk)
    chunks.push(bytes.subarray(0, remaining))
    remaining -= Math.min(bytes.length, remaining)
  }
  return Uint8Array.from(Buffer.concat(chunks))
}

export class VercelBlobPhotoStorageAdapter implements PhotoStorageAdapter {
  constructor(
    private readonly config: { token: string },
    private readonly api: BlobApi = defaultBlobApi,
  ) {}

  async createDirectUpload(input: {
    key: string
    contentType: string
    maxBytes: number
    expiresIn: number
  }): Promise<PhotoDirectUploadGrant> {
    validateKey(input.key)
    validateExpiry(input.expiresIn, MAX_UPLOAD_SIGNATURE_SECONDS)
    validateDirectUploadBytes(input.maxBytes)
    const requestedValidUntil = Date.now() + input.expiresIn * 1000
    try {
      const signedToken = await this.api.issueSignedToken({
        pathname: input.key,
        operations: ["put"],
        allowedContentTypes: [input.contentType],
        maximumSizeInBytes: input.maxBytes,
        validUntil: requestedValidUntil,
        token: this.config.token,
      })
      const { presignedUrl } = await this.api.presignUrl(signedToken, {
        pathname: input.key,
        operation: "put",
        access: "private",
        validUntil: signedToken.validUntil,
        allowedContentTypes: [input.contentType],
        maximumSizeInBytes: input.maxBytes,
      })
      return {
        provider: "vercel-blob",
        url: presignedUrl,
        expiresAt: new Date(signedToken.validUntil).toISOString(),
        requiredHeaders: { "content-type": input.contentType },
      }
    } catch (error) {
      mapProviderError(error)
    }
  }

  async inspect(key: string): Promise<PhotoObjectInfo> {
    validateKey(key)
    try {
      const result = await this.api.head(key, { token: this.config.token })
      validateMetadata(key, result)
      return {
        bytes: result.size,
        contentType: result.contentType,
        etag: result.etag,
      }
    } catch (error) {
      mapProviderError(error)
    }
  }

  async readPrefix(key: string, maxBytes: number): Promise<Uint8Array> {
    validateKey(key)
    validatePrefix(maxBytes)
    try {
      const result = await this.api.get(key, {
        token: this.config.token,
        access: "private",
        headers: { Range: `bytes=0-${maxBytes - 1}` },
      })
      if (!result) throw notFoundError()
      if (result.statusCode !== 200 || !result.stream) throw providerError()
      validateMetadata(key, result.blob)
      return await readBounded(result.stream, maxBytes)
    } catch (error) {
      mapProviderError(error)
    }
  }

  async read(key: string): Promise<Readable> {
    validateKey(key)
    try {
      const result = await this.api.get(key, {
        token: this.config.token,
        access: "private",
      })
      if (!result) throw notFoundError()
      if (result.statusCode !== 200 || !result.stream) throw providerError()
      validateMetadata(key, result.blob)
      return toNodeReadable(result.stream)
    } catch (error) {
      mapProviderError(error)
    }
  }

  async writePreview(input: {
    key: string
    bytes: Buffer
    contentType: "image/jpeg"
  }): Promise<{ etag: string }> {
    validatePreviewKey(input.key)
    try {
      const result = await this.api.put(input.key, input.bytes, {
        token: this.config.token,
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: input.contentType,
      })
      if (
        result.pathname !== input.key
        || result.contentType !== input.contentType
        || !result.etag
      ) {
        throw providerError()
      }
      return { etag: result.etag }
    } catch (error) {
      mapProviderError(error)
    }
  }

  async signRead(
    key: string,
    expiresIn: number,
  ): Promise<{ url: string; expiresAt: string }> {
    validateKey(key)
    validateExpiry(expiresIn, MAX_READ_SIGNATURE_SECONDS)
    const requestedValidUntil = Date.now() + expiresIn * 1000
    try {
      const signedToken = await this.api.issueSignedToken({
        pathname: key,
        operations: ["get"],
        validUntil: requestedValidUntil,
        token: this.config.token,
      })
      const { presignedUrl } = await this.api.presignUrl(signedToken, {
        pathname: key,
        operation: "get",
        access: "private",
        validUntil: signedToken.validUntil,
      })
      return {
        url: presignedUrl,
        expiresAt: new Date(signedToken.validUntil).toISOString(),
      }
    } catch (error) {
      mapProviderError(error)
    }
  }

  async delete(keys: string[]): Promise<void> {
    keys.forEach(validateKey)
    if (keys.length === 0) return
    try {
      await this.api.del(keys, { token: this.config.token })
    } catch (error) {
      mapProviderError(error)
    }
  }
}
