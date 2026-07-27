import { describe, expect, it, vi } from "vitest"

import { S3PhotoStorageAdapter } from "./s3-adapter"

describe("audited original access storage boundary", () => {
  it("signs an original object for at most 300 seconds", async () => {
    const presign = vi.fn(async () => "https://signed.test/original")
    const storage = new S3PhotoStorageAdapter(
      { endpoint: "http://s3.test", region: "ap-east-1", bucket: "private", accessKeyId: "test", secretAccessKey: "test", forcePathStyle: true },
      {
        client: { send: vi.fn() },
        presign,
      },
    )
    const key = "photo-jobs/00000000-0000-4000-8000-000000000001/originals/00000000-0000-4000-8000-000000000002"
    await expect(storage.signRead(key, 300)).resolves.toMatchObject({ url: "https://signed.test/original" })
    expect(presign.mock.calls[0]?.[2]).toEqual({ expiresIn: 300 })
    await expect(storage.signRead(key, 301)).rejects.toMatchObject({ code: "photo_storage_invalid_expiry" })
  })
})
