import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  UploadPartCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { loadPhotoStorageConfig } from "./config"
import {
  PhotoStorageError,
  type PhotoObjectStorage,
  type PhotoStorageConfig,
} from "./types"

const KEY_PATTERN = /^photo-jobs\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/originals\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_SIGNATURE_SECONDS = 900
const CRC32C_PATTERN = /^[A-Za-z0-9+/]{6}==$/

type CommandClient = { send(command: unknown): Promise<any> }
type Presign = (client: any, command: any, options: { expiresIn: number }) => Promise<string>
type Dependencies = {
  config?: PhotoStorageConfig
  client?: CommandClient
  presign?: Presign
}

function validateKey(key: string): void {
  if (!KEY_PATTERN.test(key)) throw new PhotoStorageError("photo_storage_invalid_key")
}

function validatePart(partNumber: number): void {
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
    throw new PhotoStorageError("photo_storage_invalid_part")
  }
}

function providerError(): PhotoStorageError {
  return new PhotoStorageError("photo_storage_provider_error")
}

function isNotFound(error: unknown): boolean {
  const value = error as { name?: string; $metadata?: { httpStatusCode?: number } }
  return value?.name === "NoSuchKey" || value?.name === "NotFound" || value?.$metadata?.httpStatusCode === 404
}

export default class PhotoStorageModuleService implements PhotoObjectStorage {
  private readonly config: PhotoStorageConfig
  private readonly client: CommandClient
  private readonly presign: Presign

  constructor(dependencies: Dependencies = {}) {
    this.config = dependencies.config ?? loadPhotoStorageConfig(process.env)
    this.client = dependencies.client ?? new S3Client({
      endpoint: this.config.endpoint,
      region: this.config.region,
      forcePathStyle: this.config.forcePathStyle,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
    } satisfies S3ClientConfig)
    this.presign = dependencies.presign ?? getSignedUrl
  }

  async startMultipartUpload(input: { key: string; contentType: string }): Promise<{ uploadId: string }> {
    validateKey(input.key)
    try {
      const result = await this.client.send(new CreateMultipartUploadCommand({
        Bucket: this.config.bucket,
        Key: input.key,
        ContentType: input.contentType,
        ChecksumAlgorithm: "CRC32C",
        ServerSideEncryption: "AES256",
      }))
      if (!result.UploadId) throw providerError()
      return { uploadId: result.UploadId }
    } catch (error) {
      if (error instanceof PhotoStorageError) throw error
      throw providerError()
    }
  }

  async signUploadPart(input: { key: string; uploadId: string; partNumber: number; checksumCRC32C: string; expiresIn?: number }): Promise<{ url: string; expiresAt: string; requiredHeaders: Record<string, string> }> {
    validateKey(input.key)
    validatePart(input.partNumber)
    if (!CRC32C_PATTERN.test(input.checksumCRC32C)) {
      throw new PhotoStorageError("photo_storage_invalid_checksum")
    }
    const expiresIn = input.expiresIn ?? MAX_SIGNATURE_SECONDS
    if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > MAX_SIGNATURE_SECONDS) {
      throw new PhotoStorageError("photo_storage_invalid_expiry")
    }
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

  async completeMultipartUpload(input: { key: string; uploadId: string; parts: Array<{ partNumber: number; etag: string; checksumCRC32C: string }> }): Promise<{ etag: string; checksumCRC32C: string }> {
    validateKey(input.key)
    if (input.parts.length === 0 || input.parts.length > 10000 || input.parts.some((part, index) => part.partNumber !== index + 1 || !part.etag || !CRC32C_PATTERN.test(part.checksumCRC32C))) {
      throw new PhotoStorageError("photo_storage_invalid_parts")
    }
    try {
      const result = await this.client.send(new CompleteMultipartUploadCommand({
        Bucket: this.config.bucket,
        Key: input.key,
        UploadId: input.uploadId,
        MultipartUpload: { Parts: input.parts.map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.etag,
          ChecksumCRC32C: part.checksumCRC32C,
        })) },
      }))
      if (!result.ETag || !result.ChecksumCRC32C) throw providerError()
      return { etag: result.ETag, checksumCRC32C: result.ChecksumCRC32C }
    } catch (error) {
      if (error instanceof PhotoStorageError) throw error
      throw providerError()
    }
  }

  async abortMultipartUpload(input: { key: string; uploadId: string }): Promise<void> {
    validateKey(input.key)
    try {
      await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.config.bucket, Key: input.key, UploadId: input.uploadId }))
    } catch (error) {
      if ((error as { name?: string }).name === "NoSuchUpload") return
      throw providerError()
    }
  }

  async headPrivateObject(key: string): Promise<{ bytes: number; contentType: string; checksumCRC32C: string }> {
    validateKey(key)
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key, ChecksumMode: "ENABLED" }))
      if (result.ContentLength === undefined || !result.ContentType || !result.ChecksumCRC32C) throw providerError()
      return { bytes: result.ContentLength, contentType: result.ContentType, checksumCRC32C: result.ChecksumCRC32C }
    } catch (error) {
      if (error instanceof PhotoStorageError) throw error
      if (isNotFound(error)) throw new PhotoStorageError("photo_storage_not_found")
      throw providerError()
    }
  }

  async readPrivateObjectPrefix(key: string, maxBytes: number): Promise<Uint8Array> {
    validateKey(key)
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 64) throw new PhotoStorageError("photo_storage_invalid_range")
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key, Range: `bytes=0-${maxBytes - 1}` }))
      if (!result.Body) throw providerError()
      const bytes = await result.Body.transformToByteArray()
      return bytes.slice(0, maxBytes)
    } catch (error) {
      if (error instanceof PhotoStorageError) throw error
      if (isNotFound(error)) throw new PhotoStorageError("photo_storage_not_found")
      throw providerError()
    }
  }

  async deletePrivateObjects(keys: string[]): Promise<void> {
    keys.forEach(validateKey)
    try {
      for (let index = 0; index < keys.length; index += 1000) {
        const chunk = keys.slice(index, index + 1000)
        const result = await this.client.send(new DeleteObjectsCommand({
          Bucket: this.config.bucket,
          Delete: { Quiet: true, Objects: chunk.map((Key) => ({ Key })) },
        }))
        if (result.Errors?.length) throw providerError()
      }
    } catch (error) {
      if (error instanceof PhotoStorageError) throw error
      throw providerError()
    }
  }
}
