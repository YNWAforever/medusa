import { Readable } from "node:stream"
import { BlobNotFoundError } from "@vercel/blob"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  VercelBlobPhotoStorageAdapter,
  type BlobApi,
} from "./vercel-blob-adapter"

const token = "scoped-token"
const key = "photo-jobs/123e4567-e89b-42d3-a456-426614174000/originals/123e4567-e89b-42d3-a456-426614174001"
const previewKey = "photo-jobs/123e4567-e89b-42d3-a456-426614174000/previews/123e4567-e89b-42d3-a456-426614174001.jpg"
const validUntil = Date.UTC(2026, 6, 26, 12, 15)

function blobResult(pathname = key) {
  return {
    url: `https://private.blob.vercel-storage.com/${pathname}`,
    downloadUrl: `https://private.blob.vercel-storage.com/${pathname}?download=1`,
    pathname,
    contentType: "image/jpeg",
    contentDisposition: "inline",
    etag: "blob-etag",
  }
}

function headResult(pathname = key) {
  return {
    ...blobResult(pathname),
    size: 42,
    uploadedAt: new Date(),
    cacheControl: "private",
  }
}

function webStream(bytes: number[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(Uint8Array.from(bytes))
      controller.close()
    },
  })
}

function getResult(pathname = key, bytes = [0xff, 0xd8, 0xff, 1]) {
  return {
    statusCode: 200 as const,
    stream: webStream(bytes),
    headers: new Headers(),
    blob: {
      ...headResult(pathname),
      size: bytes.length,
    },
  }
}

function setup() {
  const api: BlobApi = {
    issueSignedToken: vi.fn().mockResolvedValue({
      delegationToken: "delegation",
      clientSigningToken: "client-signing",
      validUntil,
    }),
    presignUrl: vi.fn().mockResolvedValue({
      presignedUrl: "https://blob.vercel-storage.com/presigned",
    }),
    head: vi.fn().mockResolvedValue(headResult()),
    get: vi.fn().mockResolvedValue(getResult()),
    put: vi.fn().mockResolvedValue(blobResult(previewKey)),
    del: vi.fn().mockResolvedValue(undefined),
  }

  return {
    api,
    adapter: new VercelBlobPhotoStorageAdapter({ token }, api),
  }
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

afterEach(() => {
  vi.useRealTimers()
})

describe("VercelBlobPhotoStorageAdapter", () => {
  it("creates a short-lived private direct-upload grant", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-26T12:00:00.000Z"))
    const { adapter, api } = setup()

    const grant = await adapter.createDirectUpload({
      key,
      contentType: "image/jpeg",
      maxBytes: 50 * 1024 * 1024,
      expiresIn: 900,
    })

    expect(api.issueSignedToken).toHaveBeenCalledWith({
      pathname: key,
      operations: ["put"],
      allowedContentTypes: ["image/jpeg"],
      maximumSizeInBytes: 50 * 1024 * 1024,
      validUntil: expect.any(Number),
      token,
    })
    expect(api.presignUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        pathname: key,
        operation: "put",
        access: "private",
      }),
    )
    expect(grant).toEqual({
      provider: "vercel-blob",
      url: "https://blob.vercel-storage.com/presigned",
      expiresAt: new Date(validUntil).toISOString(),
      requiredHeaders: { "content-type": "image/jpeg" },
    })
  })

  it("inspects private blob metadata", async () => {
    const { adapter, api } = setup()

    await expect(adapter.inspect(key)).resolves.toEqual({
      bytes: 42,
      contentType: "image/jpeg",
      etag: "blob-etag",
    })
    expect(api.head).toHaveBeenCalledWith(key, { token })
  })

  it("reads only the requested private prefix", async () => {
    const { adapter, api } = setup()

    await expect(adapter.readPrefix(key, 4)).resolves.toEqual(
      Uint8Array.from([0xff, 0xd8, 0xff, 1]),
    )
    expect(api.get).toHaveBeenCalledWith(key, {
      token,
      access: "private",
      headers: { Range: "bytes=0-3" },
    })
  })

  it("converts a full private Web stream to a Node Readable", async () => {
    const { adapter, api } = setup()

    const stream = await adapter.read(key)

    expect(stream).toBeInstanceOf(Readable)
    await expect(readAll(stream)).resolves.toEqual(
      Buffer.from([0xff, 0xd8, 0xff, 1]),
    )
    expect(api.get).toHaveBeenCalledWith(key, {
      token,
      access: "private",
    })
  })

  it("writes a deterministic private JPEG preview", async () => {
    const { adapter, api } = setup()
    const bytes = Buffer.from("preview")

    await expect(adapter.writePreview({
      key: previewKey,
      bytes,
      contentType: "image/jpeg",
    })).resolves.toEqual({ etag: "blob-etag" })
    expect(api.put).toHaveBeenCalledWith(previewKey, bytes, {
      token,
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "image/jpeg",
    })
  })

  it("signs a short-lived private read", async () => {
    const { adapter, api } = setup()

    await expect(adapter.signRead(key, 300)).resolves.toEqual({
      url: "https://blob.vercel-storage.com/presigned",
      expiresAt: new Date(validUntil).toISOString(),
    })
    expect(api.issueSignedToken).toHaveBeenCalledWith({
      pathname: key,
      operations: ["get"],
      validUntil: expect.any(Number),
      token,
    })
    expect(api.presignUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        pathname: key,
        operation: "get",
        access: "private",
      }),
    )
  })

  it("deletes private blobs in one batch", async () => {
    const { adapter, api } = setup()

    await expect(adapter.delete([key, previewKey])).resolves.toBeUndefined()
    expect(api.del).toHaveBeenCalledWith([key, previewKey], { token })
  })

  it("maps BlobNotFoundError to a stable not-found code", async () => {
    const { adapter, api } = setup()
    vi.mocked(api.head).mockRejectedValueOnce(new BlobNotFoundError())

    await expect(adapter.inspect(key)).rejects.toMatchObject({
      code: "photo_storage_not_found",
      message: "photo_storage_not_found",
    })
  })

  it.each([
    "bad",
    "photo-jobs/not-a-uuid/originals/123e4567-e89b-42d3-a456-426614174001",
    `${key}/filename.jpg`,
  ])("rejects malformed object key %s before calling Blob", async (badKey) => {
    const { adapter, api } = setup()

    await expect(adapter.inspect(badKey)).rejects.toThrow(
      "photo_storage_invalid_key",
    )
    expect(api.head).not.toHaveBeenCalled()
  })

  it("rejects mismatched or incomplete provider metadata", async () => {
    const { adapter, api } = setup()
    vi.mocked(api.head).mockResolvedValueOnce(headResult(previewKey))

    await expect(adapter.inspect(key)).rejects.toThrow(
      "photo_storage_provider_error",
    )
  })

  it("redacts token, URL, and pathname details from provider failures", async () => {
    const { adapter, api } = setup()
    vi.mocked(api.issueSignedToken).mockRejectedValueOnce(
      new Error(`failed token=${token} url=https://blob.test/${key}`),
    )

    const error = await adapter.createDirectUpload({
      key,
      contentType: "image/jpeg",
      maxBytes: 1024,
      expiresIn: 900,
    }).catch((caught) => caught)

    expect(error).toMatchObject({
      code: "photo_storage_provider_error",
      message: "photo_storage_provider_error",
    })
    expect(JSON.stringify(error)).not.toMatch(
      /scoped-token|blob\.test|photo-jobs/,
    )
  })
})
