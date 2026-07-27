import { describe, expect, it, vi } from "vitest";
import { GET } from "./[id]/assets/[assetId]/preview/route";

function fixture(owner = "cus_1", status = "ready") {
  const service = {
    retrievePhotoJob: vi.fn(async () => ({
      id: "job_1",
      customer_id: owner,
      status: "uploading",
    })),
    retrievePhotoAsset: vi.fn(async () => ({
      id: "asset_1",
      job_id: "job_1",
      status,
      storage_provider: "vercel-blob",
      preview_key: "photo-jobs/preview.jpg",
    })),
  };
  const signRead = vi.fn(async () => ({
    url: "https://signed.test/preview?secret=1",
    expiresAt: new Date().toISOString(),
  }));
  const storage = { signRead };
  const req = {
    params: { id: "job_1", assetId: "asset_1" },
    auth_context: { actor_id: "cus_1" },
    headers: { get: () => null },
    scope: {
      resolve: (name: string) =>
        name.toLowerCase().includes("storage") ? storage : service,
    },
  };
  const res = { status: vi.fn(), setHeader: vi.fn(), send: vi.fn() };
  res.status.mockReturnValue(res);
  res.setHeader.mockReturnValue(res);
  res.send.mockReturnValue(res);
  return { service, storage, req, res };
}

describe("owned photo preview route", () => {
  it("returns only a private no-store 302 signed for 300 seconds", async () => {
    const f = fixture();
    await GET(f.req as any, f.res as any);
    expect(f.storage.signRead).toHaveBeenCalledWith(
      { provider: "vercel-blob", key: "photo-jobs/preview.jpg" },
      300,
    );
    expect(f.res.status).toHaveBeenCalledWith(302);
    expect(f.res.setHeader).toHaveBeenCalledWith(
      "location",
      "https://signed.test/preview?secret=1",
    );
    expect(f.res.setHeader).toHaveBeenCalledWith(
      "cache-control",
      "private, no-store",
    );
  });

  it.each([
    ["cus_other", "ready"],
    ["cus_1", "processing"],
    ["cus_1", "deleted"],
  ])("conceals unauthorized or non-ready previews", async (owner, status) => {
    const f = fixture(owner, status);
    await expect(GET(f.req as any, f.res as any)).rejects.toThrow(
      "photo_job_not_found",
    );
    expect(f.storage.signRead).not.toHaveBeenCalled();
  });
});
