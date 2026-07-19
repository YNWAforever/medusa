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
  const storage = {
    headPrivateObject: vi.fn(async () => ({
      bytes: jpeg.length,
      contentType: "image/jpeg",
      checksumCRC32C: "sum",
    })),
    readPrivateObjectPrefix: vi.fn(async () => jpeg),
    readPrivateObject: vi.fn(async () => Readable.from(jpeg)),
    writePrivatePreview: vi.fn(async () => undefined),
    deletePrivateObjects: vi.fn(async () => undefined),
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
    f.storage.headPrivateObject
      .mockRejectedValueOnce(new Error("photo_storage_provider_error"))
      .mockRejectedValueOnce(new Error("photo_storage_provider_error"));
    await expect(processPhotoAsset("asset_1", f as any)).resolves.toMatchObject(
      { status: "ready", processing_attempts: 3 },
    );
    expect(f.storage.headPrivateObject).toHaveBeenCalledTimes(3);
  });

  it("dead-letters exhausted transient failures and emits an event", async () => {
    const f = fixture();
    f.storage.headPrivateObject.mockRejectedValue(
      new Error("photo_storage_provider_error"),
    );
    await expect(processPhotoAsset("asset_1", f as any)).resolves.toMatchObject(
      { status: "failed", failure_class: "dead_letter" },
    );
    expect(f.storage.headPrivateObject).toHaveBeenCalledTimes(3);
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
    expect(f.storage.deletePrivateObjects).toHaveBeenCalledWith([originalKey]);
  });

  it("does not overwrite deletion that wins during preview generation", async () => {
    const f = fixture();
    f.storage.writePrivatePreview.mockImplementation(async () => {
      f.current = { ...f.current, status: "deleted" };
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
    expect(f.storage.writePrivatePreview).toHaveBeenCalledTimes(3);
    expect(f.storage.deletePrivateObjects).toHaveBeenCalledTimes(3);
    expect(f.storage.deletePrivateObjects).toHaveBeenLastCalledWith([
      expect.stringContaining("/previews/"),
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
    expect(f.storage.headPrivateObject).not.toHaveBeenCalled();
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
    expect(f.storage.headPrivateObject).not.toHaveBeenCalled();
  });
});
