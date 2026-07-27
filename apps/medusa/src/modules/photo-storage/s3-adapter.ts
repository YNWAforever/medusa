import { Readable } from "node:stream"
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3"
import { Upload } from "@aws-sdk/lib-storage"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import {
  PhotoStorageError,
  type LegacyMultipartStorage,
  type PhotoDirectUploadGrant,
  type PhotoObjectInfo,
  type PhotoS3Config,
  type PhotoStorageAdapter,
} from "./types"

const ORIGINAL_KEY_PATTERN = /^photo-jobs\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/originals\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PREVIEW_KEY_PATTERN = /^photo-jobs\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/previews\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i
const CRC32C_PATTERN = /^[A-Za-z0-9+/]{6}==$/
const MAX_UPLOAD_SIGNATURE_SECONDS = 900
const MAX_DIRECT_UPLOAD_BYTES = 50 * 1024 * 1024
const MAX_READ_SIGNATURE_SECONDS = 300
const MAX_PREFIX_BYTES = 64

type CommandClient = { send(command: unknown): Promise<any> }
type Presign = (
  client: any,
  command: any,
  options: {
    expiresIn: number
    signableHeaders?: Set<string>
  },
) => Promise<string>

/**
 * Managed multipart upload. Injectable for the same reason `client` and
 * `presign` are: the suite runs with no AWS SDK client at all.
 */
type StreamUpload = (input: {
  client: unknown
  params: Record<string, unknown>
  queueSize?: number
  leavePartsOnError?: boolean
}) => { done(): Promise<{ ETag?: string }> }

export type S3AdapterDependencies = {
  client?: CommandClient
  presign?: Presign
  upload?: StreamUpload
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

function validatePart(partNumber: number): void {
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
    throw new PhotoStorageError("photo_storage_invalid_part")
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
function providerError(): PhotoStorageError {
  return new PhotoStorageError("photo_storage_provider_error")
}

function isNotFound(error: unknown): boolean {
  const value = error as {
    name?: string
    $metadata?: { httpStatusCode?: number }
  }
  return value?.name === "NoSuchKey"
    || value?.name === "NotFound"
    || value?.$metadata?.httpStatusCode === 404
}

export class S3PhotoStorageAdapter
  implements PhotoStorageAdapter, LegacyMultipartStorage {
  private readonly client: CommandClient
  private readonly presign: Presign
  private readonly upload: StreamUpload

  constructor(
    private readonly config: PhotoS3Config,
    dependencies: S3AdapterDependencies = {},
  ) {
    this.client = dependencies.client ?? new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    } satisfies S3ClientConfig)
    this.presign = dependencies.presign ?? getSignedUrl
    this.upload = dependencies.upload
      ?? ((input) => new Upload(input as never))
  }

  async createDirectUpload(input: {
    key: string
    contentType: string
    maxBytes: number
    expiresIn: number
  }): Promise<PhotoDirectUploadGrant> {
    validateKey(input.key)
    validateExpiry(input.expiresIn, MAX_UPLOAD_SIGNATURE_SECONDS)
    validateDirectUploadBytes(input.maxBytes)
    try {
      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.key,
        ContentType: input.contentType,
        ContentLength: input.maxBytes,
        ...(this.config.serverSideEncryption === false
          ? {}
          : { ServerSideEncryption: "AES256" as const }),
      })
      const url = await this.presign(this.client, command, {
        expiresIn: input.expiresIn,
        signableHeaders: new Set(["content-length", "content-type"]),
      })
      return {
        provider: "s3",
        url,
        expiresAt: new Date(
          Date.now() + input.expiresIn * 1000,
        ).toISOString(),
        requiredHeaders: {
          "content-type": input.contentType,
          ...(this.config.serverSideEncryption === false
            ? {}
            : { "x-amz-server-side-encryption": "AES256" }),
        },
      }
    } catch (error) {
      if (error instanceof PhotoStorageError) throw error
      throw providerError()
    }
  }

  async inspect(key: string): Promise<PhotoObjectInfo> {
    validateKey(key)
    try {
      const result = await this.client.send(new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      }))
      if (
        result.ContentLength === undefined
        || !result.ContentType
        || !result.ETag
      ) {
        throw providerError()
      }
      return {
        bytes: result.ContentLength,
        contentType: result.ContentType,
        etag: result.ETag,
      }
    } catch (error) {
      if (error instanceof PhotoStorageError) throw error
      if (isNotFound(error)) {
        throw new PhotoStorageError("photo_storage_not_found")
      }
      throw providerError()
    }
  }

  async headPrivateObject(key: string): Promise<{
    bytes: number
    contentType: string
    checksumCRC32C: string
  }> {
    validateKey(key)
    try {
      const result = await this.client.send(new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ChecksumMode: "ENABLED",
      }))
      if (
        result.ContentLength === undefined
        || !result.ContentType
        || !result.ChecksumCRC32C
      ) {
        throw providerError()
      }
      return {
        bytes: result.ContentLength,
        contentType: result.ContentType,
        checksumCRC32C: result.ChecksumCRC32C,
      }
    } catch (error) {
      if (error instanceof PhotoStorageError) throw error
      if (isNotFound(error)) {
        throw new PhotoStorageError("photo_storage_not_found")
      }
      throw providerError()
    }
  }

  async readPrefix(key: string, maxBytes: number): Promise<Uint8Array> {
    validateKey(key)
    if (
      !Number.isInteger(maxBytes)
      || maxBytes < 1
      || maxBytes > MAX_PREFIX_BYTES
    ) {
      throw new PhotoStorageError("photo_storage_invalid_range")
    }
    try {
      const result = await this.client.send(new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Range: `bytes=0-${maxBytes - 1}`,
      }))
      if (!result.Body) throw providerError()
      const bytes = await result.Body.transformToByteArray()
      return bytes.slice(0, maxBytes)
    } catch (error) {
      if (error instanceof PhotoStorageError) throw error
      if (isNotFound(error)) {
        throw new PhotoStorageError("photo_storage_not_found")
      }
      throw providerError()
    }
  }

  async read(key: string): Promise<Readable> {
    validateKey(key)
    try {
      const result = await this.client.send(new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      }))
      if (!result.Body || typeof result.Body.pipe !== "function") {
        throw providerError()
      }
      return result.Body as Readable
    } catch (error) {
      if (error instanceof PhotoStorageError) throw error
      if (isNotFound(error)) {
        throw new PhotoStorageError("photo_storage_not_found")
      }
      throw providerError()
    }
  }

  async writeOriginal(input: {
    key: string
    body: Readable
    contentType: string
  }): Promise<{ etag: string }> {
    validateKey(input.key)
    try {
      // PutObject needs a known Content-Length; an imported stream has none, so
      // this goes through managed multipart. queueSize 1 keeps peak memory at a
      // single part rather than four.
      const upload = this.upload({
        client: this.client,
        queueSize: 1,
        leavePartsOnError: false,
        params: {
          Bucket: this.config.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          ...(this.config.serverSideEncryption === false
            ? {}
            : { ServerSideEncryption: "AES256" as const }),
        },
      })
      const result = await upload.done()
      if (!result.ETag) throw providerError()
      return { etag: result.ETag }
    } catch (error) {
      if (error instanceof PhotoStorageError) throw error
      throw providerError()
    }
  }

  async writePreview(input: {
    key: string
    bytes: Buffer
    contentType: "image/jpeg"
  }): Promise<{ etag: string }> {
    validatePreviewKey(input.key)
    try {
      const result = await this.client.send(new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.key,
        Body: input.bytes,
        ContentType: input.contentType,
        ...(this.config.serverSideEncryption === false
          ? {}
          : { ServerSideEncryption: "AES256" as const }),
      }))
      if (!result.ETag) throw providerError()
      return { etag: result.ETag }
    } catch (error) {
      if (error instanceof PhotoStorageError) throw error
      throw providerError()
    }
  }

  async signRead(
    key: string,
    expiresIn: number,
  ): Promise<{ url: string; expiresAt: string }> {
    validateKey(key)
    validateExpiry(expiresIn, MAX_READ_SIGNATURE_SECONDS)
    try {
      const url = await this.presign(
        this.client,
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
        { expiresIn },
      )
      return {
        url,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      }
    } catch {
      throw providerError()
    }
  }

  async delete(keys: string[]): Promise<void> {
    keys.forEach(validateKey)
    try {
      for (let index = 0; index < keys.length; index += 1000) {
        const chunk = keys.slice(index, index + 1000)
        const result = await this.client.send(new DeleteObjectsCommand({
          Bucket: this.config.bucket,
          Delete: {
            Quiet: true,
            Objects: chunk.map((Key) => ({ Key })),
          },
        }))
        if (result.Errors?.length) throw providerError()
      }
    } catch (error) {
      if (error instanceof PhotoStorageError) throw error
      throw providerError()
    }
  }

  async startMultipartUpload(input: {
    key: string
    contentType: string
  }): Promise<{ uploadId: string }> {
    validateKey(input.key)
    try {
      const result = await this.client.send(
        new CreateMultipartUploadCommand({
          Bucket: this.config.bucket,
          Key: input.key,
          ContentType: input.contentType,
          ChecksumAlgorithm: "CRC32C",
          ...(this.config.serverSideEncryption === false
            ? {}
            : { ServerSideEncryption: "AES256" as const }),
        }),
      )
      if (!result.UploadId) throw providerError()
      return { uploadId: result.UploadId }
    } catch (error) {
      if (error instanceof PhotoStorageError) throw error
      throw providerError()
    }
  }

  async signUploadPart(input: {
    key: string
    uploadId: string
    partNumber: number
    checksumCRC32C: string
    expiresIn?: number
  }): Promise<PhotoDirectUploadGrant> {
    validateKey(input.key)
    validatePart(input.partNumber)
    if (!CRC32C_PATTERN.test(input.checksumCRC32C)) {
      throw new PhotoStorageError("photo_storage_invalid_checksum")
    }
    const expiresIn = input.expiresIn ?? MAX_UPLOAD_SIGNATURE_SECONDS
    validateExpiry(expiresIn, MAX_UPLOAD_SIGNATURE_SECONDS)
    try {
      const command = new UploadPartCommand({
        Bucket: this.config.bucket,
        Key: input.key,
        UploadId: input.uploadId,
        PartNumber: input.partNumber,
        ChecksumAlgorithm: "CRC32C",
        ChecksumCRC32C: input.checksumCRC32C,
      })
      const url = await this.presign(this.client, command, { expiresIn })
      return {
        provider: "s3",
        url,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
        requiredHeaders: {
          "x-amz-checksum-crc32c": input.checksumCRC32C,
          "x-amz-sdk-checksum-algorithm": "CRC32C",
        },
      }
    } catch {
      throw providerError()
    }
  }

  async completeMultipartUpload(input: {
    key: string
    uploadId: string
    parts: Array<{
      partNumber: number
      etag: string
      checksumCRC32C: string
    }>
  }): Promise<{ etag: string; checksumCRC32C: string }> {
    validateKey(input.key)
    if (
      input.parts.length === 0
      || input.parts.length > 10000
      || input.parts.some(
        (part, index) => part.partNumber !== index + 1
          || !part.etag
          || !CRC32C_PATTERN.test(part.checksumCRC32C),
      )
    ) {
      throw new PhotoStorageError("photo_storage_invalid_parts")
    }
    try {
      const result = await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.config.bucket,
          Key: input.key,
          UploadId: input.uploadId,
          MultipartUpload: {
            Parts: input.parts.map((part) => ({
              PartNumber: part.partNumber,
              ETag: part.etag,
              ChecksumCRC32C: part.checksumCRC32C,
            })),
          },
        }),
      )
      if (!result.ETag || !result.ChecksumCRC32C) throw providerError()
      return {
        etag: result.ETag,
        checksumCRC32C: result.ChecksumCRC32C,
      }
    } catch (error) {
      if (error instanceof PhotoStorageError) throw error
      throw providerError()
    }
  }

  async abortMultipartUpload(input: {
    key: string
    uploadId: string
  }): Promise<void> {
    validateKey(input.key)
    try {
      await this.client.send(new AbortMultipartUploadCommand({
        Bucket: this.config.bucket,
        Key: input.key,
        UploadId: input.uploadId,
      }))
    } catch (error) {
      if ((error as { name?: string }).name === "NoSuchUpload") return
      throw providerError()
    }
  }
}
