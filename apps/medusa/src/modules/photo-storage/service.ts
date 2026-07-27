import { Readable } from "node:stream"
import { loadPhotoStorageRuntimeConfig } from "./config"
import { S3PhotoStorageAdapter } from "./s3-adapter"
import {
  PhotoStorageError,
  type LegacyMultipartStorage,
  type PhotoDirectUploadGrant,
  type PhotoObjectInfo,
  type PhotoObjectRef,
  type PhotoObjectStorage,
  type PhotoStorageAdapter,
  type PhotoStorageProvider,
  type PhotoStorageRuntimeConfig,
} from "./types"
import { VercelBlobPhotoStorageAdapter } from "./vercel-blob-adapter"

type S3RouterAdapter = PhotoStorageAdapter & LegacyMultipartStorage

type Dependencies = {
  config?: PhotoStorageRuntimeConfig
  s3?: S3RouterAdapter
  vercelBlob?: PhotoStorageAdapter
  createS3?: (
    config: NonNullable<PhotoStorageRuntimeConfig["s3"]>,
  ) => S3RouterAdapter
  createVercelBlob?: (
    config: NonNullable<PhotoStorageRuntimeConfig["vercelBlob"]>,
  ) => PhotoStorageAdapter
}

function injected<K extends keyof Dependencies>(
  dependencies: Dependencies,
  key: K,
): Dependencies[K] | undefined {
  return Object.prototype.hasOwnProperty.call(dependencies, key)
    ? dependencies[key]
    : undefined
}

function providerUnavailable(): PhotoStorageError {
  return new PhotoStorageError("photo_storage_provider_unavailable")
}

export default class PhotoStorageModuleService implements PhotoObjectStorage {
  readonly defaultProvider: PhotoStorageProvider
  private readonly adapters: Partial<
    Record<PhotoStorageProvider, PhotoStorageAdapter>
  >
  private readonly legacyS3?: S3RouterAdapter

  constructor(dependencies: Dependencies = {}) {
    const config = injected(dependencies, "config")
      ?? loadPhotoStorageRuntimeConfig(process.env)
    const createS3 = injected(dependencies, "createS3")
      ?? ((s3Config) => new S3PhotoStorageAdapter(s3Config))
    const createVercelBlob = injected(dependencies, "createVercelBlob")
      ?? ((blobConfig) => new VercelBlobPhotoStorageAdapter(blobConfig))

    this.defaultProvider = config.defaultProvider
    this.legacyS3 = config.s3
      ? (injected(dependencies, "s3") ?? createS3(config.s3))
      : undefined
    const vercelBlob = config.vercelBlob
      ? (
        injected(dependencies, "vercelBlob")
        ?? createVercelBlob(config.vercelBlob)
      )
      : undefined
    this.adapters = {
      ...(this.legacyS3 ? { s3: this.legacyS3 } : {}),
      ...(vercelBlob ? { "vercel-blob": vercelBlob } : {}),
    }
  }

  private adapter(provider: PhotoStorageProvider): PhotoStorageAdapter {
    const adapter = this.adapters[provider]
    if (!adapter) throw providerUnavailable()
    return adapter
  }

  private legacy(provider: unknown): S3RouterAdapter {
    if (provider !== "s3" || !this.legacyS3) throw providerUnavailable()
    return this.legacyS3
  }

  async createDirectUpload(input: {
    provider: PhotoStorageProvider
    key: string
    contentType: string
    maxBytes: number
    expiresIn: number
  }): Promise<PhotoDirectUploadGrant> {
    const { provider, ...adapterInput } = input
    return this.adapter(provider).createDirectUpload(adapterInput)
  }

  async inspect(ref: PhotoObjectRef): Promise<PhotoObjectInfo> {
    return this.adapter(ref.provider).inspect(ref.key)
  }

  async readPrefix(
    ref: PhotoObjectRef,
    maxBytes: number,
  ): Promise<Uint8Array> {
    return this.adapter(ref.provider).readPrefix(ref.key, maxBytes)
  }

  async read(ref: PhotoObjectRef): Promise<Readable> {
    return this.adapter(ref.provider).read(ref.key)
  }

  async writePreview(input: {
    ref: PhotoObjectRef
    bytes: Buffer
    contentType: "image/jpeg"
  }): Promise<{ etag: string }> {
    return this.adapter(input.ref.provider).writePreview({
      key: input.ref.key,
      bytes: input.bytes,
      contentType: input.contentType,
    })
  }

  async signRead(
    ref: PhotoObjectRef,
    expiresIn: number,
  ): Promise<{ url: string; expiresAt: string }> {
    return this.adapter(ref.provider).signRead(ref.key, expiresIn)
  }

  async delete(refs: PhotoObjectRef[]): Promise<void> {
    const s3Keys: string[] = []
    const vercelBlobKeys: string[] = []
    for (const ref of refs) {
      if (ref.provider === "s3") s3Keys.push(ref.key)
      else if (ref.provider === "vercel-blob") vercelBlobKeys.push(ref.key)
      else throw providerUnavailable()
    }

    const s3 = s3Keys.length ? this.adapter("s3") : undefined
    const vercelBlob = vercelBlobKeys.length
      ? this.adapter("vercel-blob") : undefined

    await Promise.all([
      ...(s3 ? [s3.delete(s3Keys)] : []),
      ...(vercelBlob ? [vercelBlob.delete(vercelBlobKeys)] : []),
    ])
  }

  async startLegacyMultipart(input: {
    provider: "s3"
    key: string
    contentType: string
  }): Promise<{ uploadId: string }> {
    return this.legacy(input.provider).startMultipartUpload({
      key: input.key,
      contentType: input.contentType,
    })
  }

  async signLegacyPart(input: {
    provider: "s3"
    key: string
    uploadId: string
    partNumber: number
    checksumCRC32C: string
    expiresIn?: number
  }): Promise<PhotoDirectUploadGrant> {
    const { provider, ...adapterInput } = input
    return this.legacy(provider).signUploadPart(adapterInput)
  }

  async completeLegacyMultipart(input: {
    provider: "s3"
    key: string
    uploadId: string
    parts: Array<{
      partNumber: number
      etag: string
      checksumCRC32C: string
    }>
  }): Promise<{ etag: string }> {
    const { provider, ...adapterInput } = input
    const result = await this.legacy(provider).completeMultipartUpload(
      adapterInput,
    )
    return { etag: result.etag }
  }

  async abortLegacyMultipart(input: {
    provider: "s3"
    key: string
    uploadId: string
  }): Promise<void> {
    const { provider, ...adapterInput } = input
    return this.legacy(provider).abortMultipartUpload(adapterInput)
  }
}
