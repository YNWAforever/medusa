import { randomUUID } from "node:crypto"

import { afterAll, describe, expect, it } from "@jest/globals"

import PhotoStorageModuleService from "../../src/modules/photo-storage/service"

const endpoint = process.env.PHOTO_STORAGE_ENDPOINT ?? "http://localhost:9002"
const config = {
  endpoint,
  region: process.env.PHOTO_STORAGE_REGION ?? "us-east-1",
  bucket: process.env.PHOTO_STORAGE_BUCKET ?? "fotomax-photo-private",
  accessKeyId: process.env.PHOTO_STORAGE_ACCESS_KEY ?? "fotomax_minio",
  secretAccessKey: process.env.PHOTO_STORAGE_SECRET_KEY ?? "fotomax_minio_local_only",
  forcePathStyle: true,
  serverSideEncryption: false,
}
const storage = new PhotoStorageModuleService({ config })
const createdKeys: string[] = []

function objectKey(): string {
  return `photo-jobs/${randomUUID()}/originals/${randomUUID()}`
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

describe("private photo storage", () => {
  afterAll(async () => {
    await storage.deletePrivateObjects(createdKeys)
  })

  it("creates, uploads, completes, heads, and deletes a private multipart object", async () => {
    const key = objectKey()
    const body = Buffer.from("fotomax-private-photo")
    const checksumCRC32C = crc32c(body)
    const { uploadId } = await storage.startMultipartUpload({
      key,
      contentType: "image/jpeg",
    })
    const signedPart = await storage.signUploadPart({
      key,
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
    const uploadedChecksum = upload.headers.get("x-amz-checksum-crc32c")
    expect(etag).toBeTruthy()
    expect(uploadedChecksum).toBe(checksumCRC32C)

    await storage.completeMultipartUpload({
      key,
      uploadId,
      parts: [{
        partNumber: 1,
        etag: etag as string,
        checksumCRC32C: checksumCRC32C as string,
      }],
    })
    createdKeys.push(key)

    await expect(storage.headPrivateObject(key)).resolves.toEqual({
      bytes: body.length,
      contentType: "image/jpeg",
      checksumCRC32C: `${crc32c(Buffer.from(checksumCRC32C, "base64"))}-1`,
    })

    await expect(storage.readPrivateObjectPrefix(key, 12)).resolves.toEqual(Uint8Array.from(body.subarray(0, 12)))

    const unsigned = await fetch(`${endpoint}/${config.bucket}/${key}`)
    expect(unsigned.status).toBe(403)

    await storage.deletePrivateObjects([key])
    createdKeys.splice(createdKeys.indexOf(key), 1)
    await expect(storage.deletePrivateObjects([key])).resolves.toBeUndefined()
  })

  it("aborts idempotently", async () => {
    const key = objectKey()
    const { uploadId } = await storage.startMultipartUpload({
      key,
      contentType: "image/jpeg",
    })

    await expect(storage.abortMultipartUpload({ key, uploadId })).resolves.toBeUndefined()
    await expect(storage.abortMultipartUpload({ key, uploadId })).resolves.toBeUndefined()
  })
})
