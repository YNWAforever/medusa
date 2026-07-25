import { describe, expect, it, vi } from "vitest";
import { DELETE } from "./[id]/assets/[assetId]/route";

function fixture(owner = "cus_1", provider = "vercel-blob") {
  const asset = {
    id: "asset_1",
    job_id: "job_1",
    object_key: "private/key",
    storage_provider: provider,
    status: "uploaded",
  };
  const service: Record<string, any> = {
    retrievePhotoJob: vi.fn(async () => ({
      id: "job_1",
      customer_id: owner,
      status: "uploading",
    })),
    retrievePhotoAsset: vi.fn(async () => asset),
    listPhotoUploadSessions: vi.fn(async () => []),
    updatePhotoUploadSessions: vi.fn(async (input) => [
      { id: input.selector.id, status: "aborted" },
    ]),
    updatePhotoAssets: vi.fn(async () => [{ ...asset, status: "deleted" }]),
    withPhotoJobTransaction: vi.fn(async (callback) =>
      callback({ transactionManager: {} }),
    ),
  };
  const abortLegacyMultipart = vi.fn(async () => undefined);
  const deleteObjects = vi.fn(async () => undefined);
  const storage: Record<string, any> = {
    abortLegacyMultipart,
    delete: deleteObjects,
  };
  const req = {
    params: { id: "job_1", assetId: "asset_1" },
    auth_context: { actor_id: "cus_1" },
    headers: { get: () => null },
    scope: {
      resolve: (name: string) =>
        name.toLowerCase().includes("storage") ? storage : service,
    },
  };
  const res = { json: vi.fn() };
  return { asset, service, storage, req, res };
}

describe("owned photo asset delete", () => {
  it("durably releases the asset before deleting private bytes", async () => {
    const { asset, service, storage, req, res } = fixture();
    const order: string[] = [];
    service.updatePhotoAssets.mockImplementation(async () => {
      order.push("db");
      return [{ ...asset, status: "deleted" }];
    });
    storage.delete.mockImplementation(async () => {
      order.push("provider");
    });

    await DELETE(req, res);

    expect(order).toEqual(["db", "provider"]);
    expect(storage.delete).toHaveBeenCalledWith([
      { provider: "vercel-blob", key: asset.object_key },
    ]);
    expect(res.json).toHaveBeenCalledWith({
      asset: { id: "asset_1", status: "deleted" },
    });
  });

  it("leaves provider bytes untouched when the database transition fails", async () => {
    const { service, storage, req, res } = fixture();
    service.withPhotoJobTransaction.mockRejectedValue(
      new Error("database unavailable"),
    );
    await expect(DELETE(req, res)).rejects.toThrow("database unavailable");
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("keeps deleted state retryable when provider cleanup fails", async () => {
    const { asset, service, storage, req, res } = fixture();
    storage.delete.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(DELETE(req, res)).rejects.toThrow("provider unavailable");
    service.retrievePhotoAsset.mockResolvedValue({ ...asset, status: "deleted" });
    storage.delete.mockResolvedValueOnce(undefined);
    await DELETE(req, res);
    expect(storage.delete).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith({
      asset: { id: "asset_1", status: "deleted" },
    });
  });

  it("does not swallow persisted s3 multipart abort failures", async () => {
    const { service, storage, req, res } = fixture("cus_1", "s3");
    service.listPhotoUploadSessions.mockResolvedValue([
      {
        id: "session_1",
        storage_provider: "s3",
        upload_strategy: "multipart",
        provider_upload_id: "provider_1",
      },
    ]);
    storage.abortLegacyMultipart.mockRejectedValue(
      new Error("abort unavailable"),
    );
    await expect(DELETE(req, res)).rejects.toThrow("abort unavailable");
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("never aborts multipart for single-put sessions", async () => {
    const { service, storage, req, res } = fixture();
    service.listPhotoUploadSessions.mockResolvedValue([
      {
        id: "session_1",
        storage_provider: "vercel-blob",
        upload_strategy: "single-put",
        provider_upload_id: null,
      },
    ]);

    await DELETE(req, res);

    expect(storage.abortLegacyMultipart).not.toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledWith([
      { provider: "vercel-blob", key: "private/key" },
    ]);
  });

  it("conceals assets from another customer", async () => {
    const { req, res } = fixture("cus_other");
    await expect(DELETE(req, res)).rejects.toThrow("photo_job_not_found");
  });
});
