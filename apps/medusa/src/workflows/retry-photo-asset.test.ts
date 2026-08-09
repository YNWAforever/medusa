import { describe, expect, it, vi } from "vitest";
import { retryDeadLetteredPhotoAsset } from "./retry-photo-asset";

describe("retryDeadLetteredPhotoAsset", () => {
  it("writes an audit before conditionally clearing dead-letter state", async () => {
    const calls: string[] = [];
    const asset = {
      id: "asset_1",
      job_id: "job_1",
      status: "failed",
      failure_class: "dead_letter",
      dead_lettered_at: new Date(),
    };
    const service = {
      retrievePhotoAsset: vi.fn(async () => asset),
      createPhotoAssetAccessAudits: vi.fn(async () => {
        calls.push("audit");
        return {};
      }),
      updatePhotoAssets: vi.fn(async ({ data }) => {
        calls.push("update");
        return [{ ...asset, ...data }];
      }),
    };
    const eventBus = {
      emit: vi.fn(async () => {
        calls.push("event");
      }),
    };
    await expect(
      retryDeadLetteredPhotoAsset(
        {
          assetId: "asset_1",
          jobId: "job_1",
          actorId: "admin_1",
          requestId: "req_1",
        },
        { service, eventBus },
      ),
    ).resolves.toMatchObject({
      status: "processing",
      failure_class: null,
      dead_lettered_at: null,
    });
    expect(calls).toEqual(["audit", "update", "event"]);
    expect(service.updatePhotoAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        selector: {
          id: "asset_1",
          status: "failed",
          failure_class: "dead_letter",
        },
      }),
    );
  });

  it("privacy-safely rejects an asset from another job", async () => {
    const service = {
      retrievePhotoAsset: vi.fn(async () => ({
        id: "asset_1",
        job_id: "other",
        status: "failed",
        failure_class: "dead_letter",
      })),
    };
    await expect(
      retryDeadLetteredPhotoAsset(
        { assetId: "asset_1", jobId: "job_1", actorId: "admin_1" },
        { service, eventBus: { emit: vi.fn() } } as any,
      ),
    ).rejects.toThrow("photo_asset_retry_unavailable");
  });
});
