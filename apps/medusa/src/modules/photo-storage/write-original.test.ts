import { Readable } from "node:stream"
import { describe, expect, it, vi } from "vitest"

import { S3PhotoStorageAdapter } from "./s3-adapter"
import { VercelBlobPhotoStorageAdapter } from "./vercel-blob-adapter"
import { PhotoStorageError } from "./types"

const s3Config = {
  endpoint: "http://localhost:9002",
  region: "us-east-1",
  bucket: "fotomax-photo-private",
  accessKeyId: "fotomax",
  secretAccessKey: "local-secret",
  forcePathStyle: true,
}
const key =
  "photo-jobs/123e4567-e89b-42d3-a456-426614174000/originals/123e4567-e89b-42d3-a456-426614174001"
const previewKey =
  "photo-jobs/123e4567-e89b-42d3-a456-426614174000/previews/123e4567-e89b-42d3-a456-426614174001.jpg"

function body(): Readable {
  return Readable.from([Buffer.from("photo-bytes")])
}

describe("S3PhotoStorageAdapter.writeOriginal", () => {
  function setup(done: () => Promise<{ ETag?: string }> = async () => ({ ETag: '"etag"' })) {
    const upload = vi.fn(() => ({ done }))
    const storage = new S3PhotoStorageAdapter(s3Config, {
      client: { send: vi.fn() },
      presign: vi.fn(),
      upload,
    })
    return { storage, upload }
  }

  it("streams through managed multipart rather than a length-bound PutObject", async () => {
    const { storage, upload } = setup()
    const stream = body()

    await expect(
      storage.writeOriginal({ key, body: stream, contentType: "image/jpeg" }),
    ).resolves.toEqual({ etag: '"etag"' })

    expect(upload).toHaveBeenCalledTimes(1)
    const call = upload.mock.calls[0][0]
    expect(call.params).toMatchObject({
      Bucket: s3Config.bucket,
      Key: key,
      Body: stream,
      ContentType: "image/jpeg",
    })
  })

  it("keeps peak memory to one part and cleans up on failure", async () => {
    const { storage, upload } = setup()

    await storage.writeOriginal({ key, body: body(), contentType: "image/jpeg" })

    expect(upload.mock.calls[0][0]).toMatchObject({
      queueSize: 1,
      leavePartsOnError: false,
    })
  })

  it("encrypts at rest unless explicitly disabled", async () => {
    const { storage, upload } = setup()
    await storage.writeOriginal({ key, body: body(), contentType: "image/jpeg" })
    expect(upload.mock.calls[0][0].params).toMatchObject({ ServerSideEncryption: "AES256" })

    const plain = new S3PhotoStorageAdapter(
      { ...s3Config, serverSideEncryption: false },
      { client: { send: vi.fn() }, presign: vi.fn(), upload },
    )
    await plain.writeOriginal({ key, body: body(), contentType: "image/jpeg" })
    expect(upload.mock.calls[1][0].params).not.toHaveProperty("ServerSideEncryption")
  })

  it.each(["bad", `${key}/nested`, "photo-jobs/not-a-uuid/originals/x"])(
    "rejects the malformed key %s before touching the network",
    async (badKey) => {
      const { storage, upload } = setup()

      await expect(
        storage.writeOriginal({ key: badKey, body: body(), contentType: "image/jpeg" }),
      ).rejects.toThrow("photo_storage_invalid_key")
      expect(upload).not.toHaveBeenCalled()
    },
  )

  it("maps a provider failure to a typed storage error", async () => {
    const { storage } = setup(async () => {
      throw new Error("connection reset")
    })

    await expect(
      storage.writeOriginal({ key, body: body(), contentType: "image/jpeg" }),
    ).rejects.toBeInstanceOf(PhotoStorageError)
  })

  it("treats a missing ETag as a failed write", async () => {
    const { storage } = setup(async () => ({}))

    await expect(
      storage.writeOriginal({ key, body: body(), contentType: "image/jpeg" }),
    ).rejects.toBeInstanceOf(PhotoStorageError)
  })

  it("never leaks provider detail into the raised error", async () => {
    const { storage } = setup(async () => {
      throw new Error("AccessDenied for arn:aws:s3:::secret-bucket")
    })

    await expect(
      storage.writeOriginal({ key, body: body(), contentType: "image/jpeg" }),
    ).rejects.not.toThrow(/secret-bucket/)
  })
})

describe("VercelBlobPhotoStorageAdapter.writeOriginal", () => {
  function setup(put = vi.fn(async () => ({ pathname: key, etag: "blob-etag" }))) {
    const storage = new VercelBlobPhotoStorageAdapter(
      { token: "blob-token" },
      { put } as never,
    )
    return { storage, put }
  }

  it("hands the stream straight to the provider, private and without a random suffix", async () => {
    const { storage, put } = setup()
    const stream = body()

    await expect(
      storage.writeOriginal({ key, body: stream, contentType: "image/jpeg" }),
    ).resolves.toEqual({ etag: "blob-etag" })

    expect(put).toHaveBeenCalledWith(key, stream, {
      token: "blob-token",
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "image/jpeg",
    })
  })

  it("rejects a write that landed under a different pathname", async () => {
    const { storage } = setup(
      vi.fn(async () => ({ pathname: `${key}-suffixed`, etag: "blob-etag" })),
    )

    await expect(
      storage.writeOriginal({ key, body: body(), contentType: "image/jpeg" }),
    ).rejects.toBeInstanceOf(PhotoStorageError)
  })

  it("rejects a malformed key before calling the provider", async () => {
    const { storage, put } = setup()

    await expect(
      storage.writeOriginal({ key: "nope", body: body(), contentType: "image/jpeg" }),
    ).rejects.toThrow("photo_storage_invalid_key")
    expect(put).not.toHaveBeenCalled()
  })

  it("accepts a preview key too, since both live under the same job prefix", async () => {
    const { storage, put } = setup(
      vi.fn(async () => ({ pathname: previewKey, etag: "blob-etag" })),
    )

    await expect(
      storage.writeOriginal({ key: previewKey, body: body(), contentType: "image/jpeg" }),
    ).resolves.toEqual({ etag: "blob-etag" })
    expect(put).toHaveBeenCalled()
  })
})
