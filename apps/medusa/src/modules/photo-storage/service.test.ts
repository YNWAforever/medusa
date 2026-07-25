import { describe, expect, it, vi } from "vitest"
import { S3PhotoStorageAdapter } from "./s3-adapter"

const config = {
  endpoint: "http://localhost:9002",
  region: "us-east-1",
  bucket: "fotomax-photo-private",
  accessKeyId: "fotomax",
  secretAccessKey: "local-secret",
  forcePathStyle: true,
}
const key = "photo-jobs/123e4567-e89b-42d3-a456-426614174000/originals/123e4567-e89b-42d3-a456-426614174001"
const checksumCRC32C = "hRHAOg=="

function setup(responses: unknown[] = []) {
  const send = vi.fn()
  for (const response of responses) send.mockResolvedValueOnce(response)
  const sign = vi.fn().mockResolvedValue("https://storage.test/object?X-Amz-Credential=secret")
  return {
    send,
    sign,
    storage: new S3PhotoStorageAdapter(config, { client: { send }, presign: sign }),
  }
}

describe("S3PhotoStorageAdapter guards", () => {
  it.each(["bad", "photo-jobs/not-a-uuid/originals/123e4567-e89b-42d3-a456-426614174001", `${key}/file.jpg`])("rejects malformed object key %s", async (badKey) => {
    const { storage, send } = setup()
    await expect(storage.startMultipartUpload({ key: badKey, contentType: "image/jpeg" })).rejects.toThrow("photo_storage_invalid_key")
    expect(send).not.toHaveBeenCalled()
  })

  it.each([0, 10001, 1.5])("rejects invalid part number %s", async (partNumber) => {
    const { storage } = setup()
    await expect(storage.signUploadPart({ key, uploadId: "upload-1", partNumber, checksumCRC32C })).rejects.toThrow("photo_storage_invalid_part")
  })

  it("rejects nonconsecutive completion parts", async () => {
    const { storage } = setup()
    await expect(storage.completeMultipartUpload({ key, uploadId: "upload-1", parts: [
      { partNumber: 1, etag: "one", checksumCRC32C },
      { partNumber: 3, etag: "three", checksumCRC32C },
    ] })).rejects.toThrow("photo_storage_invalid_parts")
  })

  it("rejects more than 10000 completion parts", async () => {
    const { storage } = setup()
    const parts = Array.from({ length: 10001 }, (_, index) => ({
      partNumber: index + 1,
      etag: `etag-${index + 1}`,
      checksumCRC32C,
    }))

    await expect(storage.completeMultipartUpload({ key, uploadId: "upload-1", parts }))
      .rejects.toThrow("photo_storage_invalid_parts")
  })

  it("rejects signatures longer than 900 seconds", async () => {
    const { storage } = setup()
    await expect(storage.signUploadPart({ key, uploadId: "upload-1", partNumber: 1, checksumCRC32C, expiresIn: 901 })).rejects.toThrow("photo_storage_invalid_expiry")
  })
})

describe("S3PhotoStorageAdapter AWS operations", () => {
  it("creates an encrypted direct-upload grant", async () => {
    const { storage, sign } = setup()

    await expect(storage.createDirectUpload({
      key,
      contentType: "image/jpeg",
      maxBytes: 50 * 1024 * 1024,
      expiresIn: 900,
    })).resolves.toEqual({
      provider: "s3",
      url: "https://storage.test/object?X-Amz-Credential=secret",
      expiresAt: expect.any(String),
      requiredHeaders: {
        "content-type": "image/jpeg",
        "x-amz-server-side-encryption": "AES256",
      },
    })
    expect(sign.mock.calls[0][1].input).toEqual({
      Bucket: config.bucket,
      Key: key,
      ContentType: "image/jpeg",
      ServerSideEncryption: "AES256",
    })
    expect(sign.mock.calls[0][2]).toEqual({ expiresIn: 900 })
  })

  it("starts an encrypted CRC32C multipart upload", async () => {
    const { storage, send } = setup([{ UploadId: "upload-1" }])
    await expect(storage.startMultipartUpload({ key, contentType: "image/jpeg" })).resolves.toEqual({ uploadId: "upload-1" })
    expect(send.mock.calls[0][0].input).toMatchObject({ Bucket: config.bucket, Key: key, ContentType: "image/jpeg", ChecksumAlgorithm: "CRC32C", ServerSideEncryption: "AES256" })
  })

  it("signs an UploadPart command for at most 900 seconds", async () => {
    const { storage, sign } = setup()
    const result = await storage.signUploadPart({ key, uploadId: "upload-1", partNumber: 1, checksumCRC32C, expiresIn: 900 })
    expect(sign.mock.calls[0][2]).toEqual({ expiresIn: 900 })
    expect(sign.mock.calls[0][1].input).toMatchObject({ ChecksumAlgorithm: "CRC32C", ChecksumCRC32C: checksumCRC32C, PartNumber: 1, UploadId: "upload-1" })
    expect(result.provider).toBe("s3")
    expect(result.url).toContain("X-Amz-Credential")
    expect(result.requiredHeaders).toEqual({ "x-amz-checksum-crc32c": checksumCRC32C, "x-amz-sdk-checksum-algorithm": "CRC32C" })
  })
  it("binds the caller checksum into the real presigned URL", async () => {
    const storage = new S3PhotoStorageAdapter(config)

    const result = await storage.signUploadPart({
      key,
      uploadId: "upload-1",
      partNumber: 1,
      checksumCRC32C,
    })

    expect(new URL(result.url).searchParams.get("x-amz-checksum-crc32c")).toBe(checksumCRC32C)
  })


  it("completes multipart uploads in caller order", async () => {
    const { storage, send } = setup([{ ETag: "final", ChecksumCRC32C: "sum" }])
    await expect(storage.completeMultipartUpload({ key, uploadId: "upload-1", parts: [
      { partNumber: 1, etag: "one", checksumCRC32C },
      { partNumber: 2, etag: "two", checksumCRC32C: "T7uE7Q==" },
    ] })).resolves.toEqual({ etag: "final", checksumCRC32C: "sum" })
    expect(send.mock.calls[0][0].input.MultipartUpload.Parts).toEqual([
      { PartNumber: 1, ETag: "one", ChecksumCRC32C: checksumCRC32C },
      { PartNumber: 2, ETag: "two", ChecksumCRC32C: "T7uE7Q==" },
    ])
  })

  it("heads private metadata", async () => {
    const { storage } = setup([{ ContentLength: 42, ContentType: "image/jpeg", ETag: "etag" }])
    await expect(storage.inspect(key)).resolves.toEqual({ bytes: 42, contentType: "image/jpeg", etag: "etag" })
  })

  it("preserves checksum inspection for legacy S3 callers", async () => {
    const { storage } = setup([
      { ContentLength: 42, ContentType: "image/jpeg", ChecksumCRC32C: "sum" },
    ])
    await expect(storage.headPrivateObject(key)).resolves.toEqual({
      bytes: 42, contentType: "image/jpeg", checksumCRC32C: "sum",
    })
  })

  it("maps missing private objects to a stable redacted code", async () => {
    const { storage, send } = setup()
    send.mockRejectedValueOnce(Object.assign(new Error("secret object path"), { name: "NoSuchKey" }))
    await expect(storage.inspect(key)).rejects.toThrow("photo_storage_not_found")
  })
  it("reads only a bounded private object prefix", async () => {
    const transformToByteArray = vi.fn(async () => Uint8Array.from([0xff, 0xd8, 0xff, 1]))
    const { storage, send } = setup([{ Body: { transformToByteArray } }])
    await expect(storage.readPrefix(key, 12)).resolves.toEqual(Uint8Array.from([0xff, 0xd8, 0xff, 1]))
    expect(send.mock.calls[0][0].input.Range).toBe("bytes=0-11")
    await expect(storage.readPrefix(key, 65)).rejects.toThrow("photo_storage_invalid_range")
  })

  it("writes encrypted private previews and returns their ETag", async () => {
    const previewKey = key
      .replace("/originals/", "/previews/")
      .concat(".jpg")
    const bytes = Buffer.from("preview")
    const { storage, send } = setup([{ ETag: "preview-etag" }])

    await expect(storage.writePreview({
      key: previewKey,
      bytes,
      contentType: "image/jpeg",
    })).resolves.toEqual({ etag: "preview-etag" })
    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: config.bucket,
      Key: previewKey,
      Body: bytes,
      ContentType: "image/jpeg",
      ServerSideEncryption: "AES256",
    })
  })

  it("deletes keys in S3-sized chunks and accepts an empty list", async () => {
    const { storage, send } = setup([{}, {}])
    await storage.delete(Array.from({ length: 1001 }, (_, index) =>
      key.replace(/123e4567-e89b-42d3-a456-426614174001$/, `123e4567-e89b-42d3-a456-${index.toString(16).padStart(12, "0")}`),
    ))
    expect(send).toHaveBeenCalledTimes(2)
    await storage.delete([])
    expect(send).toHaveBeenCalledTimes(2)
  })

  it("treats a missing multipart upload abort as idempotent", async () => {
    const { storage, send } = setup()
    send.mockRejectedValueOnce(Object.assign(new Error("missing"), { name: "NoSuchUpload" }))
    await expect(storage.abortMultipartUpload({ key, uploadId: "missing" })).resolves.toBeUndefined()
  })

  it("redacts provider credentials and URLs from stable errors", async () => {
    const { storage, send } = setup()
    send.mockRejectedValueOnce(new Error("failed https://s3.test/x?X-Amz-Credential=TOPSECRET accessKey=fotomax filename.jpg"))
    const error = await storage.startMultipartUpload({ key, contentType: "image/jpeg" }).catch((caught) => caught)
    expect(error).toMatchObject({ code: "photo_storage_provider_error", message: "photo_storage_provider_error" })
    expect(JSON.stringify(error)).not.toMatch(/TOPSECRET|filename\.jpg|fotomax/)
  })
})
