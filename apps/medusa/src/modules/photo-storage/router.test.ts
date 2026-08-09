import { Readable } from "node:stream"
import { describe, expect, it, vi } from "vitest"
import PhotoStorageModuleService from "./service"
import type {
  LegacyMultipartStorage,
  PhotoStorageAdapter,
  PhotoStorageRuntimeConfig,
} from "./types"

const key = "photo-jobs/123e4567-e89b-42d3-a456-426614174000/originals/123e4567-e89b-42d3-a456-426614174001"
const previewKey = "photo-jobs/123e4567-e89b-42d3-a456-426614174000/previews/123e4567-e89b-42d3-a456-426614174001.jpg"
const s3Config = {
  endpoint: "http://localhost:9002",
  region: "us-east-1",
  bucket: "fotomax-photo-private",
  accessKeyId: "fotomax",
  secretAccessKey: "local-secret",
  forcePathStyle: true,
}

type S3RouterAdapter = PhotoStorageAdapter & LegacyMultipartStorage

function adapter(provider: "s3" | "vercel-blob"): PhotoStorageAdapter {
  return {
    createDirectUpload: vi.fn().mockResolvedValue({
      provider,
      url: "https://storage.test/upload",
      expiresAt: "2026-07-26T12:15:00.000Z",
      requiredHeaders: { "content-type": "image/jpeg" },
    }),
    inspect: vi.fn().mockResolvedValue({
      bytes: 42,
      contentType: "image/jpeg",
      etag: "etag",
    }),
    readPrefix: vi.fn().mockResolvedValue(Uint8Array.from([0xff, 0xd8])),
    read: vi.fn().mockResolvedValue(Readable.from("photo")),
    writePreview: vi.fn().mockResolvedValue({ etag: "preview-etag" }),
    signRead: vi.fn().mockResolvedValue({
      url: "https://storage.test/read",
      expiresAt: "2026-07-26T12:05:00.000Z",
    }),
    delete: vi.fn().mockResolvedValue(undefined),
  }
}

function s3Adapter(): S3RouterAdapter {
  return {
    ...adapter("s3"),
    startMultipartUpload: vi.fn().mockResolvedValue({ uploadId: "upload-1" }),
    signUploadPart: vi.fn().mockResolvedValue({
      provider: "s3",
      url: "https://storage.test/part",
      expiresAt: "2026-07-26T12:15:00.000Z",
      requiredHeaders: {},
    }),
    completeMultipartUpload: vi.fn().mockResolvedValue({ etag: "final" }),
    abortMultipartUpload: vi.fn().mockResolvedValue(undefined),
  }
}

function configuredRouter() {
  const s3 = s3Adapter()
  const blob = adapter("vercel-blob")
  const config: PhotoStorageRuntimeConfig = {
    defaultProvider: "vercel-blob",
    s3: s3Config,
    vercelBlob: { token: "scoped-token" },
  }
  const router = new PhotoStorageModuleService({ config, s3, vercelBlob: blob })
  return { router, s3, blob }
}

describe("PhotoStorageModuleService router", () => {
  it("exposes the configured default provider", () => {
    const { router } = configuredRouter()

    expect(router.defaultProvider).toBe("vercel-blob")
  })

  it("dispatches object inspection only to the referenced provider", async () => {
    const { router, s3, blob } = configuredRouter()

    await router.inspect({ provider: "vercel-blob", key })

    expect(blob.inspect).toHaveBeenCalledWith(key)
    expect(s3.inspect).not.toHaveBeenCalled()
  })

  it("dispatches direct-upload creation by the requested provider", async () => {
    const { router, s3, blob } = configuredRouter()

    await router.createDirectUpload({
      provider: "s3",
      key,
      contentType: "image/jpeg",
      maxBytes: 1024,
      expiresIn: 900,
    })

    expect(s3.createDirectUpload).toHaveBeenCalledWith({
      key,
      contentType: "image/jpeg",
      maxBytes: 1024,
      expiresIn: 900,
    })
    expect(blob.createDirectUpload).not.toHaveBeenCalled()
  })

  it("groups deletes by provider without crossing adapter boundaries", async () => {
    const { router, s3, blob } = configuredRouter()

    await router.delete([
      { provider: "s3", key },
      { provider: "vercel-blob", key: previewKey },
    ])

    expect(s3.delete).toHaveBeenCalledWith([key])
    expect(blob.delete).toHaveBeenCalledWith([previewKey])
  })

  it("preflights every delete provider before deleting anything", async () => {
    const s3 = s3Adapter()
    const router = new PhotoStorageModuleService({
      config: {
        defaultProvider: "s3",
        s3: s3Config,
      },
      s3,
    })

    await expect(router.delete([
      { provider: "s3", key },
      { provider: "vercel-blob", key: previewKey },
    ])).rejects.toThrow("photo_storage_provider_unavailable")
    expect(s3.delete).not.toHaveBeenCalled()
  })

  it("fails with a stable code when a referenced adapter is unavailable", async () => {
    const router = new PhotoStorageModuleService({
      config: { defaultProvider: "s3" },
    })

    await expect(router.inspect({ provider: "s3", key })).rejects.toMatchObject({
      code: "photo_storage_provider_unavailable",
      message: "photo_storage_provider_unavailable",
    })
  })

  it("constructs adapters only for configured providers", () => {
    const s3 = s3Adapter()
    const blob = adapter("vercel-blob")
    const createS3 = vi.fn(() => s3)
    const createVercelBlob = vi.fn(() => blob)

    new PhotoStorageModuleService({
      config: {
        defaultProvider: "vercel-blob",
        vercelBlob: { token: "scoped-token" },
      },
      createS3,
      createVercelBlob,
    })

    expect(createS3).not.toHaveBeenCalled()
    expect(createVercelBlob).toHaveBeenCalledWith({ token: "scoped-token" })
  })

  it("routes explicitly named legacy multipart methods only to S3", async () => {
    const { router, s3 } = configuredRouter()

    await expect(router.startLegacyMultipart({
      provider: "s3",
      key,
      contentType: "image/jpeg",
    })).resolves.toEqual({ uploadId: "upload-1" })
    expect(s3.startMultipartUpload).toHaveBeenCalledWith({
      key,
      contentType: "image/jpeg",
    })
  })

  it("fails closed when a non-S3 provider reaches a legacy method", async () => {
    const { router, s3 } = configuredRouter()

    await expect(router.startLegacyMultipart({
      provider: "vercel-blob",
      key,
      contentType: "image/jpeg",
    } as never)).rejects.toThrow("photo_storage_provider_unavailable")
    expect(s3.startMultipartUpload).not.toHaveBeenCalled()
  })
  it("exposes multipart only through the explicit legacy methods", () => {

    for (const method of [
      "startMultipartUpload",
      "signUploadPart",
      "completeMultipartUpload",
      "abortMultipartUpload",
    ]) {
      expect(Object.prototype.hasOwnProperty.call(
        PhotoStorageModuleService.prototype,
        method,
      )).toBe(false)
    }
  })
})
