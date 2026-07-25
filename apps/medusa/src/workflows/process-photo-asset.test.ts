import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { processImage } from "../modules/photo-production/image-processor";
import { processPhotoAsset } from "./process-photo-asset";

vi.mock("../modules/photo-production/image-processor", () => ({
  processImage: vi.fn(),
}));

const originalKey =
  "photo-jobs/123e4567-e89b-42d3-a456-426614174000/originals/123e4567-e89b-42d3-a456-426614174001";
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]);

function fixture() {
  let current: Record<string, any> = {
    id: "asset_1",
    job_id: "job_1",
    object_key: originalKey,
    storage_provider: "vercel-blob",
    display_name: "photo.jpg",
    reported_mime_type: "image/jpeg",
    expected_bytes: jpeg.length,
    status: "uploaded",
    processing_attempts: 0,
  };
  const updatePhotoAssets = vi.fn(async ({ selector, data }) => {
    if (
      selector.id !== current.id ||
      (selector.status && selector.status !== current.status)
    )
      return [];
    if (
      selector.failure_class &&
      selector.failure_class !== current.failure_class
    )
      return [];
    current = { ...current, ...data };
    return [current];
  });
  const service = {
    retrievePhotoAsset: vi.fn(async () => current),
    updatePhotoAssets,
    listPhotoAssets: vi.fn(async () => []),
  };
  const inspect = vi.fn(async () => ({
    bytes: jpeg.length,
    contentType: "image/jpeg",
    etag: "etag",
  }));
  const readPrefix = vi.fn(async () => jpeg);
  const read = vi.fn(async () => Readable.from(jpeg));
  const writePreview = vi.fn(async () => ({ etag: "preview-etag" }));
  const deleteObjects = vi.fn(async () => undefined);
  const storage = {
    inspect,
    readPrefix,
    read,
    writePreview,
    delete: deleteObjects,
  };
  const acquired: string[] = [];
  const locking = {
    acquire: vi.fn(async (key: string) => {
      acquired.push(key);
      return { release: vi.fn(async () => undefined) };
    }),
  };
  const eventBus = { emit: vi.fn(async () => undefined) };
  return {
    get current() {
      return current;
    },
    set current(value) {
      current = value;
    },
    service,
    storage,
    locking,
    eventBus,
    acquired,
  };
}

describe("processPhotoAsset", () => {
  beforeEach(() => {
    vi.mocked(processImage)
      .mockReset()
      .mockResolvedValue({
        preview: Buffer.from("preview"),
        width: 1800,
        height: 1200,
        orientation: 1,
        estimatedPpi: 300,
        qualityBand: "good",
      } as any);
  });

  it("retries transient storage failures three times and then succeeds", async () => {
    const f = fixture();
    f.storage.inspect
      .mockRejectedValueOnce(new Error("photo_storage_provider_error"))
      .mockRejectedValueOnce(new Error("photo_storage_provider_error"));
    await expect(processPhotoAsset("asset_1", f as any)).resolves.toMatchObject(
      { status: "ready", processing_attempts: 3 },
    );
    expect(f.storage.inspect).toHaveBeenCalledTimes(3);
    expect(f.storage.inspect).toHaveBeenCalledWith({
      provider: "vercel-blob",
      key: originalKey,
    });
    expect(f.storage.readPrefix).toHaveBeenCalledWith(
      { provider: "vercel-blob", key: originalKey },
      64,
    );
    expect(f.storage.read).toHaveBeenCalledWith({
      provider: "vercel-blob",
      key: originalKey,
    });
    expect(f.storage.writePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: {
          provider: "vercel-blob",
          key: expect.stringContaining("/previews/"),
        },
      }),
    );
  });

  it("dead-letters exhausted transient failures and emits an event", async () => {
    const f = fixture();
    f.storage.inspect.mockRejectedValue(
      new Error("photo_storage_provider_error"),
    );
    await expect(processPhotoAsset("asset_1", f as any)).resolves.toMatchObject(
      { status: "failed", failure_class: "dead_letter" },
    );
    expect(f.storage.inspect).toHaveBeenCalledTimes(3);
    expect(f.eventBus.emit).toHaveBeenCalledWith({
      name: "photo_asset.dead_lettered",
      data: { asset_id: "asset_1" },
    });
  });

  it("blocks permanent image-policy failures without retrying", async () => {
    const f = fixture();
    vi.mocked(processImage).mockRejectedValue(
      new Error("photo_image_decode_failed"),
    );
    await expect(processPhotoAsset("asset_1", f as any)).resolves.toMatchObject(
      { status: "blocked", failure_code: "photo_image_decode_failed" },
    );
    expect(processImage).toHaveBeenCalledTimes(1);
  });

  it("serializes same-job dedupe and deletes a duplicate original", async () => {
    const f = fixture();
    f.service.listPhotoAssets.mockResolvedValue([
      { id: "ready_1", job_id: "job_1", status: "ready" },
    ]);
    await expect(processPhotoAsset("asset_1", f as any)).resolves.toMatchObject(
      { status: "blocked", failure_code: "duplicate_asset" },
    );
    expect(f.acquired).toContain("photo-job:job_1:dedupe");
    expect(f.storage.delete).toHaveBeenCalledWith([
      { provider: "vercel-blob", key: originalKey },
    ]);
  });

  it("does not overwrite deletion that wins during preview generation", async () => {
    const f = fixture();
    f.storage.writePreview.mockImplementation(async () => {
      f.current = { ...f.current, status: "deleted" };
      return { etag: "preview-etag" };
    });
    await expect(processPhotoAsset("asset_1", f as any)).resolves.toMatchObject(
      { status: "deleted" },
    );
    expect(f.service.updatePhotoAssets).not.toHaveBeenCalledWith(
      expect.objectContaining({
        selector: { id: "asset_1", status: "deleted" },
        data: expect.objectContaining({ status: "ready" }),
      }),
    );
  });

  it("removes previews whose ready-state commit fails", async () => {
    const f = fixture();
    f.service.updatePhotoAssets.mockImplementation(
      async ({ selector, data }: Record<string, any>) => {
        if (data.status === "ready") throw new Error("database_unavailable");
        if (selector.status && selector.status !== f.current.status) return [];
        f.current = { ...f.current, ...data };
        return [f.current];
      },
    );

    await expect(processPhotoAsset("asset_1", f as any)).resolves.toMatchObject(
      { status: "failed", failure_class: "dead_letter" },
    );
    expect(f.storage.writePreview).toHaveBeenCalledTimes(3);
    expect(f.storage.delete).toHaveBeenCalledTimes(3);
    expect(f.storage.delete).toHaveBeenLastCalledWith([
      {
        provider: "vercel-blob",
        key: expect.stringContaining("/previews/"),
      },
    ]);
  });

  it("propagates transient database reads so the event can be retried", async () => {
    const f = fixture();
    f.service.retrievePhotoAsset.mockRejectedValue(
      new Error("database_unavailable"),
    );

    await expect(processPhotoAsset("asset_1", f as any)).rejects.toThrow(
      "database_unavailable",
    );
    expect(f.storage.inspect).not.toHaveBeenCalled();
  });
  it("leaves unaudited dead letters untouched", async () => {
    const f = fixture();
    f.current = {
      ...f.current,
      status: "failed",
      failure_class: "dead_letter",
      dead_lettered_at: new Date(),
    };
    await expect(processPhotoAsset("asset_1", f as any)).resolves.toMatchObject(
      { status: "failed", failure_class: "dead_letter" },
    );
    expect(f.storage.inspect).not.toHaveBeenCalled();
  });

  it("routes historical assets without a provider to s3", async () => {
    const f = fixture();
    delete f.current.storage_provider;
    f.service.listPhotoAssets.mockResolvedValue([
      { id: "ready_1", job_id: "job_1", status: "ready" },
    ]);

    await processPhotoAsset("asset_1", f as any);

    expect(f.storage.delete).toHaveBeenCalledWith([
      { provider: "s3", key: originalKey },
    ]);
  });
});
