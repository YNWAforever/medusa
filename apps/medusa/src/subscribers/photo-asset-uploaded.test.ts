import { describe, expect, it, vi } from "vitest";
import { processPhotoAsset } from "../workflows/process-photo-asset";
import photoAssetUploaded, { config } from "./photo-asset-uploaded";

vi.mock("../workflows/process-photo-asset", () => ({
  processPhotoAsset: vi.fn(async () => undefined),
}));

describe("photo_asset.uploaded subscriber", () => {
  it("resolves worker dependencies and forwards a 120-second lock adapter", async () => {

    const locking = { acquire: vi.fn(async () => undefined), release: vi.fn(async () => true) };
    const values: Record<string, unknown> = {
      locking,
      photoProduction: {},
      photoStorage: {},
      event_bus: {},
    };
    const container = {
      resolve: vi.fn(
        (name: string) =>
          values[name] ??
          values[
            name.toLowerCase().includes("storage")
              ? "photoStorage"
              : "photoProduction"
          ],
      ),
    };
    await photoAssetUploaded({ event: { name: "photo_asset.uploaded", data: { asset_id: "asset_1" } }, container } as never);
    expect(config).toEqual({ event: "photo_asset.uploaded" });
    expect(processPhotoAsset).toHaveBeenCalledWith(
      "asset_1",
      expect.objectContaining({
        service: expect.anything(),
        storage: expect.anything(),
        eventBus: expect.anything(),
      }),
    );
    const adapter = vi.mocked(processPhotoAsset).mock.calls[0]?.[1].locking;
    const lock = await adapter!.acquire("photo-asset:asset_1", 120);
    expect(locking.acquire).toHaveBeenCalledWith("photo-asset:asset_1", {
      ownerId: expect.any(String),
      expire: 120,
    });
    await lock.release();
    expect(locking.release).toHaveBeenCalledWith("photo-asset:asset_1", {
      ownerId: expect.any(String),
    });
  });
});
