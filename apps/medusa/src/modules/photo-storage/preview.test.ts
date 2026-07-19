import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import PhotoStorageModuleService from "./service";

const config = {
  endpoint: "http://localhost:9002",
  region: "us-east-1",
  bucket: "private",
  accessKeyId: "key",
  secretAccessKey: "secret",
  forcePathStyle: true,
};
const original =
  "photo-jobs/123e4567-e89b-42d3-a456-426614174000/originals/123e4567-e89b-42d3-a456-426614174001";
const preview =
  "photo-jobs/123e4567-e89b-42d3-a456-426614174000/previews/123e4567-e89b-42d3-a456-426614174001.jpg";

describe("private processing storage", () => {
  it("streams originals without buffering", async () => {
    const body = Readable.from(Buffer.from("image"));
    const send = vi.fn(async () => ({ Body: body }));
    const service = new PhotoStorageModuleService({
      config,
      client: { send },
      presign: vi.fn(),
    });
    await expect(service.readPrivateObject(original)).resolves.toBe(body);
    expect(send.mock.calls[0]?.[0].input).toMatchObject({
      Bucket: "private",
      Key: original,
    });
  });

  it("writes encrypted JPEG previews", async () => {
    const send = vi.fn(async () => ({}));
    const service = new PhotoStorageModuleService({
      config,
      client: { send },
      presign: vi.fn(),
    });
    await service.writePrivatePreview({
      key: preview,
      bytes: Buffer.from("preview"),
      contentType: "image/jpeg",
    });
    expect(send.mock.calls[0]?.[0].input).toMatchObject({
      Key: preview,
      ContentType: "image/jpeg",
      ServerSideEncryption: "AES256",
    });
  });

  it("signs preview reads for no more than 300 seconds", async () => {
    const presign = vi.fn(async () => "https://signed.test/preview");
    const service = new PhotoStorageModuleService({
      config,
      client: { send: vi.fn() },
      presign,
    });
    await expect(service.signPrivateRead(preview, 300)).resolves.toMatchObject({
      url: "https://signed.test/preview",
    });
    expect(presign.mock.calls[0]?.[2]).toEqual({ expiresIn: 300 });
    await expect(service.signPrivateRead(preview, 301)).rejects.toThrow(
      "photo_storage_invalid_expiry",
    );
  });
});
