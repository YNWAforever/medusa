import { randomUUID } from "node:crypto"

import { afterAll, describe, expect, it } from "@jest/globals"

import PhotoStorageModuleService from "../../src/modules/photo-storage/service"
import type { PhotoObjectRef } from "../../src/modules/photo-storage/types"

const endpoint = process.env.PHOTO_STORAGE_ENDPOINT ?? "http://localhost:9002"
const s3Config = {
  endpoint,
  region: process.env.PHOTO_STORAGE_REGION ?? "us-east-1",
  bucket: process.env.PHOTO_STORAGE_BUCKET ?? "fotomax-photo-private",
  accessKeyId: process.env.PHOTO_STORAGE_ACCESS_KEY ?? "fotomax_minio",
  secretAccessKey:
    process.env.PHOTO_STORAGE_SECRET_KEY ?? "fotomax_minio_local_only",
  forcePathStyle: true,
  serverSideEncryption: false,
}
const storage = new PhotoStorageModuleService({
  config: { defaultProvider: "s3", s3: s3Config },
})
const createdRefs: PhotoObjectRef[] = []

function objectRef(): PhotoObjectRef {
  return {
    provider: "s3",
    key: `photo-jobs/${randomUUID()}/originals/${randomUUID()}`,
  }
}

function crc32c(bytes: Uint8Array): string {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0x82f63b78 : 0)
    }
  }
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return checksum.toString("base64")
}

async function streamBytes(ref: PhotoObjectRef): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of await storage.read(ref)) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

describe("private photo storage", () => {
  afterAll(async () => {
    if (createdRefs.length) await storage.delete(createdRefs)
  })

  it("uploads exact bytes through a signed direct PUT and inspects its opaque ETag", async () => {
    const ref = objectRef()
    const body = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x46, 0x6f, 0x74, 0x6f,
      0x6d, 0x61, 0x78, 0x2d, 0x70, 0x72, 0x69, 0x76,
      0x61, 0x74, 0x65,
    ])
    const grant = await storage.createDirectUpload({
      provider: "s3",
      key: ref.key,
      contentType: "image/jpeg",
      maxBytes: body.length,
      expiresIn: 900,
    })
    expect(grant).toMatchObject({
      provider: "s3",
      url: expect.any(String),
      requiredHeaders: { "content-type": "image/jpeg" },
      expiresAt: expect.any(String),
    })

    const upload = await fetch(grant.url, {
      method: "PUT",
      headers: grant.requiredHeaders,
      body,
    })
    expect(upload.status).toBe(200)
    const etag = upload.headers.get("etag")
    expect(etag).toEqual(expect.any(String))
    createdRefs.push(ref)

    await expect(storage.inspect(ref)).resolves.toEqual({
      bytes: body.length,
      contentType: "image/jpeg",
      etag,
    })
    await expect(storage.readPrefix(ref, 12)).resolves.toEqual(
      Uint8Array.from(body.subarray(0, 12)),
    )
    await expect(streamBytes(ref)).resolves.toEqual(body)

    const unsigned = await fetch(`${endpoint}/${s3Config.bucket}/${ref.key}`)
    expect(unsigned.status).toBe(403)

    await storage.delete([ref])
    createdRefs.splice(createdRefs.indexOf(ref), 1)
    await expect(storage.delete([ref])).resolves.toBeUndefined()
    await expect(storage.inspect(ref)).rejects.toThrow("photo_storage_not_found")
  })

  it("retains explicit legacy multipart completion for active S3 sessions", async () => {
    const ref = objectRef()
    const body = Buffer.from("fotomax-legacy-private-photo")
    const checksumCRC32C = crc32c(body)
    const { uploadId } = await storage.startLegacyMultipart({
      provider: "s3",
      key: ref.key,
      contentType: "image/jpeg",
    })
    const signedPart = await storage.signLegacyPart({
      provider: "s3",
      key: ref.key,
      uploadId,
      partNumber: 1,
      checksumCRC32C,
    })
    const upload = await fetch(signedPart.url, {
      method: "PUT",
      headers: signedPart.requiredHeaders,
      body,
    })
    expect(upload.status).toBe(200)
    const etag = upload.headers.get("etag")
    expect(etag).toEqual(expect.any(String))
    expect(upload.headers.get("x-amz-checksum-crc32c")).toBe(checksumCRC32C)

    const completed = await storage.completeLegacyMultipart({
      provider: "s3",
      key: ref.key,
      uploadId,
      parts: [{
        partNumber: 1,
        etag: etag as string,
        checksumCRC32C,
      }],
    })
    createdRefs.push(ref)
    await expect(storage.inspect(ref)).resolves.toEqual({
      bytes: body.length,
      contentType: "image/jpeg",
      etag: completed.etag,
    })
  })

  it("aborts a legacy S3 multipart upload idempotently", async () => {
    const ref = objectRef()
    const { uploadId } = await storage.startLegacyMultipart({
      provider: "s3",
      key: ref.key,
      contentType: "image/jpeg",
    })

    const input = { provider: "s3" as const, key: ref.key, uploadId }
    await expect(storage.abortLegacyMultipart(input)).resolves.toBeUndefined()
    await expect(storage.abortLegacyMultipart(input)).resolves.toBeUndefined()
  })
})
