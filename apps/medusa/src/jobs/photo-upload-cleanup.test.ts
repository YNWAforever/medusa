import { describe, expect, it, vi } from "vitest";
import { runPhotoUploadCleanup } from "./photo-upload-cleanup";

function fixture() {
  const asset = {
    id: "asset_1",
    job_id: "job_1",
    object_key: "private/random",
    preview_key: null as string | null,
    storage_provider: "vercel-blob",
    display_name: "secret-name.jpg",
    status: "uploading",
  };
  const session = {
    id: "session_1",
    asset_id: asset.id,
    provider_upload_id: null as string | null,
    storage_provider: "vercel-blob",
    upload_strategy: "single-put",
    status: "active",
  };
  const service: Record<string, any> = {
    listPhotoUploadSessions: vi.fn(async (filters) =>
      filters.status === "active" ? [session] : [],
    ),
    retrievePhotoAsset: vi.fn(async () => asset),
    updatePhotoUploadSessions: vi.fn(async (input) => [
      { ...session, ...input.data },
    ]),
    updatePhotoAssets: vi.fn(async (input) => [{ ...asset, ...input.data }]),
    listPhotoJobs: vi.fn(async () => []),
    updatePhotoJobs: vi.fn(async () => []),
    listPhotoAssets: vi.fn(async () => []),
  };
  const abortLegacyMultipart = vi.fn(async () => undefined);
  const deleteObjects = vi.fn(async () => undefined);
  const storage: Record<string, any> = {
    abortLegacyMultipart,
    delete: deleteObjects,
  };
  const messages: string[] = [];
  const logger = {
    info: vi.fn((message) => messages.push(message)),
    warn: vi.fn((message) => messages.push(message)),
  };
  return { asset, session, service, storage, logger, messages };
}

function useLegacyMultipart(f: ReturnType<typeof fixture>) {
  f.asset.storage_provider = "s3";
  f.session.storage_provider = "s3";
  f.session.upload_strategy = "multipart";
  f.session.provider_upload_id = "provider-secret";
}

describe("photo upload cleanup", () => {
  it("expires s3 multipart sessions only after provider abort succeeds", async () => {
    const f = fixture();
    useLegacyMultipart(f);

    await expect(runPhotoUploadCleanup(f)).resolves.toMatchObject({
      expiredSessions: 1,
    });

    expect(f.storage.abortLegacyMultipart).toHaveBeenCalledWith({
      provider: "s3",
      key: f.asset.object_key,
      uploadId: "provider-secret",
    });
    expect(f.service.updatePhotoUploadSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        selector: { id: "session_1", status: "active" },
        data: expect.objectContaining({ status: "expired" }),
      }),
    );
  });

  it("rotates provider failures behind later expired sessions", async () => {
    const f = fixture();
    useLegacyMultipart(f);
    f.storage.abortLegacyMultipart.mockRejectedValue(
      new Error("provider unavailable"),
    );

    await expect(runPhotoUploadCleanup(f)).resolves.toMatchObject({
      failures: 1,
    });

    expect(f.service.updatePhotoUploadSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        selector: { id: "session_1", status: "active" },
        data: { expires_at: expect.any(Date) },
      }),
    );
  });

  it("deletes a single-put object without aborting multipart", async () => {
    const f = fixture();

    await expect(runPhotoUploadCleanup(f)).resolves.toMatchObject({
      expiredSessions: 1,
    });

    expect(f.storage.delete).toHaveBeenCalledWith([
      { provider: "vercel-blob", key: f.asset.object_key },
    ]);
    expect(f.storage.abortLegacyMultipart).not.toHaveBeenCalled();
  });

  it("defers cancelled-job media to the retention job", async () => {
    const f = fixture();
    f.service.listPhotoUploadSessions.mockResolvedValue([]);
    f.service.listPhotoJobs.mockResolvedValue([
      { id: "job_1", status: "cancelled" },
    ]);
    f.service.listPhotoAssets.mockResolvedValue([]);
    await expect(runPhotoUploadCleanup(f)).resolves.toMatchObject({
      deletedAssets: 0,
    });
    expect(f.service.listPhotoJobs).not.toHaveBeenCalled();
    expect(f.storage.delete).not.toHaveBeenCalled();
  });

  it("removes completed cleanup from the retry query", async () => {
    const f = fixture();
    f.asset.preview_key = "private/preview";
    f.service.listPhotoUploadSessions.mockResolvedValue([]);
    f.service.listPhotoAssets.mockResolvedValue([
      { ...f.asset, status: "deleted" },
    ]);
    await runPhotoUploadCleanup(f);
    expect(f.service.listPhotoAssets).toHaveBeenCalledWith(
      { status: "deleted", provider_cleanup_completed_at: null },
      expect.objectContaining({
        order: { updated_at: "ASC" },
        withDeleted: true,
      }),
    );
    expect(f.storage.delete).toHaveBeenCalledWith([
      { provider: "vercel-blob", key: f.asset.object_key },
      { provider: "vercel-blob", key: f.asset.preview_key },
    ]);
    expect(f.service.updatePhotoAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider_cleanup_completed_at: expect.any(Date),
        }),
      }),
    );
  });

  it("does not complete cleanup when deleting asset objects fails", async () => {
    const f = fixture();
    f.asset.preview_key = "private/preview";
    f.service.listPhotoUploadSessions.mockResolvedValue([]);
    f.service.listPhotoAssets.mockResolvedValue([
      { ...f.asset, status: "deleted" },
    ]);
    f.storage.delete.mockRejectedValue(new Error("provider unavailable"));

    await expect(runPhotoUploadCleanup(f)).resolves.toMatchObject({
      failures: 1,
      deletedAssets: 0,
    });

    expect(f.storage.delete).toHaveBeenCalledWith([
      { provider: "vercel-blob", key: f.asset.object_key },
      { provider: "vercel-blob", key: f.asset.preview_key },
    ]);
    expect(f.service.updatePhotoAssets).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider_cleanup_completed_at: expect.any(Date),
        }),
      }),
    );
  });

  it("bounds every candidate query", async () => {
    const f = fixture();
    f.service.listPhotoUploadSessions.mockResolvedValue([]);
    await runPhotoUploadCleanup({ ...f, batchSize: 7 });
    expect(f.service.listPhotoUploadSessions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ take: 7 }),
    );
    expect(f.service.listPhotoAssets).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ take: 7 }),
    );
  });

  it("never logs filenames, credentials, signed URLs, or byte content", async () => {
    const f = fixture();
    await runPhotoUploadCleanup(f);
    const output = f.messages.join("\n");
    expect(output).toContain("session_id=session_1");
    expect(output).not.toContain("secret-name.jpg");
    expect(output).not.toContain("provider-secret");
    expect(output).not.toMatch(/https?:|credential|bytes=/i);
  });

  it("aborts only persisted s3 multipart sessions for deleted assets", async () => {
    const f = fixture();
    f.service.listPhotoUploadSessions.mockImplementation(async (filters) =>
      filters.status === "active"
        ? []
        : [
            { storage_provider: "s3", upload_strategy: "multipart", provider_upload_id: "legacy" },
            { storage_provider: "vercel-blob", upload_strategy: "multipart", provider_upload_id: "wrong-provider" },
            { storage_provider: "s3", upload_strategy: "single-put", provider_upload_id: "wrong-strategy" },
          ],
    );
    f.service.listPhotoAssets.mockResolvedValue([
      { ...f.asset, status: "deleted" },
    ]);

    await runPhotoUploadCleanup(f);

    expect(f.storage.abortLegacyMultipart).toHaveBeenCalledTimes(1);
    expect(f.storage.abortLegacyMultipart).toHaveBeenCalledWith({
      provider: "s3",
      key: f.asset.object_key,
      uploadId: "legacy",
    });
  });

  it("does not add terminal-job assets to explicit cleanup candidates", async () => {
    const f = fixture();
    f.service.listPhotoUploadSessions.mockResolvedValue([]);
    f.service.listPhotoJobs.mockResolvedValue([
      { id: "terminal_job", status: "cancelled" },
    ]);
    const deleted = [
      { ...f.asset, id: "deleted_1", status: "deleted" },
      { ...f.asset, id: "deleted_2", status: "deleted" },
    ];
    const terminal = {
      ...f.asset,
      id: "terminal_asset",
      job_id: "terminal_job",
      object_key: "private/terminal",
    };
    f.service.listPhotoAssets.mockImplementation(async (filters) =>
      filters.status === "deleted"
        ? deleted
        : filters.job_id === "terminal_job"
          ? [terminal]
          : [],
    );
    await runPhotoUploadCleanup({ ...f, batchSize: 2 });
    expect(f.storage.delete).toHaveBeenCalledTimes(2);
    expect(f.storage.delete).not.toHaveBeenCalledWith([
      { provider: "vercel-blob", key: terminal.object_key },
    ]);
  });
});
