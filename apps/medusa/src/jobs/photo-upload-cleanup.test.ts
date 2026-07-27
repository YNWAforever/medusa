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

function cleanupCandidate(
  f: ReturnType<typeof fixture>,
  id: string,
  status: "active" | "expired",
) {
  return {
    ...f.session,
    id,
    asset_id: `asset_${id}`,
    status,
    expires_at: new Date("2026-07-26T00:00:00.000Z"),
    ...(status === "expired" ? { aborted_at: null } : {}),
  };
}

function useCleanupQueues(
  f: ReturnType<typeof fixture>,
  retryable: ReturnType<typeof cleanupCandidate>[],
  active: ReturnType<typeof cleanupCandidate>[],
) {
  f.service.listPhotoUploadSessions.mockImplementation(async (filters) =>
    filters.status === "expired"
      ? retryable
      : filters.status === "active"
        ? active
        : [],
  );
  f.service.retrievePhotoAsset.mockImplementation(async (assetId) => ({
    ...f.asset,
    id: assetId,
    object_key: `private/${assetId}`,
  }));
}

describe("photo upload cleanup", () => {
  it("claims s3 multipart sessions before provider abort", async () => {
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
    expect(
      f.service.updatePhotoUploadSessions.mock.invocationCallOrder[0],
    ).toBeLessThan(
      f.storage.abortLegacyMultipart.mock.invocationCallOrder[0],
    );
  });

  it("keeps a provider failure in cleanup-owned retry state", async () => {
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
        data: { status: "expired" },
      }),
    );
    expect(f.service.updatePhotoUploadSessions).not.toHaveBeenCalledWith(
      expect.objectContaining({
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

  it("does not delete when completion wins before the stale-session claim", async () => {
    const f = fixture();
    let sessionStatus = "active";
    f.service.retrievePhotoAsset.mockImplementation(async () => {
      sessionStatus = "completed";
      return f.asset;
    });
    f.service.updatePhotoUploadSessions.mockImplementation(async (input) => {
      if (
        input.selector.status === "active" &&
        sessionStatus === "active"
      ) {
        sessionStatus = input.data.status;
        return [{ ...f.session, ...input.data }];
      }
      return [];
    });

    await expect(runPhotoUploadCleanup(f)).resolves.toMatchObject({
      expiredSessions: 0,
      failures: 0,
    });

    expect(sessionStatus).toBe("completed");
    expect(f.storage.delete).not.toHaveBeenCalled();
    expect(f.storage.abortLegacyMultipart).not.toHaveBeenCalled();
  });

  it("blocks completion after cleanup wins and retries provider deletion", async () => {
    const f = fixture();
    let sessionStatus = "active";
    let abortedAt: Date | null = null;
    let completionCommitted = false;
    let providerAttempts = 0;
    f.service.listPhotoUploadSessions.mockImplementation(async (filters) => {
      if (
        filters.status === "expired" &&
        sessionStatus === "expired" &&
        abortedAt === null
      ) {
        return [{ ...f.session, status: sessionStatus, aborted_at: null }];
      }
      if (filters.status === "active" && sessionStatus === "active") {
        return [{ ...f.session, status: sessionStatus }];
      }
      return [];
    });
    f.service.updatePhotoUploadSessions.mockImplementation(async (input) => {
      if (
        input.selector.status === "active" &&
        sessionStatus === "active"
      ) {
        sessionStatus = "expired";
        return [{ ...f.session, status: sessionStatus, aborted_at: null }];
      }
      if (
        input.selector.status === "expired" &&
        input.selector.aborted_at === null &&
        sessionStatus === "expired" &&
        abortedAt === null
      ) {
        abortedAt = input.data.aborted_at;
        return [{ ...f.session, status: sessionStatus, aborted_at: abortedAt }];
      }
      return [];
    });
    f.storage.delete.mockImplementation(async () => {
      providerAttempts += 1;
      if (sessionStatus === "active") {
        sessionStatus = "completed";
        completionCommitted = true;
      }
      if (providerAttempts === 1) throw new Error("provider unavailable");
    });

    await expect(runPhotoUploadCleanup(f)).resolves.toMatchObject({
      expiredSessions: 0,
      failures: 1,
    });

    expect(sessionStatus).toBe("expired");
    expect(abortedAt).toBeNull();
    expect(completionCommitted).toBe(false);

    await expect(runPhotoUploadCleanup(f)).resolves.toMatchObject({
      expiredSessions: 1,
      failures: 0,
    });

    expect(providerAttempts).toBe(2);
    expect(sessionStatus).toBe("expired");
    expect(abortedAt).toBeInstanceOf(Date);
    expect(completionCommitted).toBe(false);
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

  it("reserves capacity for active stale sessions behind a full retry backlog", async () => {
    const f = fixture();
    const batchSize = 4;
    const retryable = Array.from({ length: batchSize + 2 }, (_, index) =>
      cleanupCandidate(f, `retry_${index}`, "expired"),
    );
    const active = Array.from({ length: batchSize }, (_, index) =>
      cleanupCandidate(f, `active_${index}`, "active"),
    );
    useCleanupQueues(f, retryable, active);

    await expect(
      runPhotoUploadCleanup({ ...f, batchSize }),
    ).resolves.toMatchObject({
      expiredSessions: batchSize,
      failures: 0,
    });

    expect(
      f.service.retrievePhotoAsset.mock.calls.map(([assetId]) => assetId),
    ).toEqual([
      "asset_retry_0",
      "asset_retry_1",
      "asset_active_0",
      "asset_active_1",
    ]);
    expect(
      f.service.updatePhotoUploadSessions.mock.calls
        .map(([input]) => input.selector)
        .filter((selector) => selector.status === "active"),
    ).toEqual([
      { id: "active_0", status: "active" },
      { id: "active_1", status: "active" },
    ]);
    expect(f.service.listPhotoUploadSessions).toHaveBeenCalledWith(
      { status: "expired", aborted_at: null },
      { take: batchSize, order: { expires_at: "ASC" } },
    );
    expect(f.service.listPhotoUploadSessions).toHaveBeenCalledWith(
      { status: "active", expires_at: { $lt: expect.any(Date) } },
      { take: batchSize, order: { expires_at: "ASC" } },
    );
  });

  it("fills unused active quota from retry records", async () => {
    const f = fixture();
    const retryable = Array.from({ length: 6 }, (_, index) =>
      cleanupCandidate(f, `retry_${index}`, "expired"),
    );
    const active = [cleanupCandidate(f, "active_0", "active")];
    useCleanupQueues(f, retryable, active);

    await expect(
      runPhotoUploadCleanup({ ...f, batchSize: 4 }),
    ).resolves.toMatchObject({
      expiredSessions: 4,
      failures: 0,
    });

    expect(
      f.service.retrievePhotoAsset.mock.calls.map(([assetId]) => assetId),
    ).toEqual([
      "asset_retry_0",
      "asset_retry_1",
      "asset_active_0",
      "asset_retry_2",
    ]);
  });

  it("fills unused retry quota from active stale sessions", async () => {
    const f = fixture();
    const retryable = [cleanupCandidate(f, "retry_0", "expired")];
    const active = Array.from({ length: 6 }, (_, index) =>
      cleanupCandidate(f, `active_${index}`, "active"),
    );
    useCleanupQueues(f, retryable, active);

    await expect(
      runPhotoUploadCleanup({ ...f, batchSize: 4 }),
    ).resolves.toMatchObject({
      expiredSessions: 4,
      failures: 0,
    });

    expect(
      f.service.retrievePhotoAsset.mock.calls.map(([assetId]) => assetId),
    ).toEqual([
      "asset_retry_0",
      "asset_active_0",
      "asset_active_1",
      "asset_active_2",
    ]);
  });

  it("deduplicates candidates while filling the bounded batch", async () => {
    const f = fixture();
    const retryable = [
      cleanupCandidate(f, "shared", "expired"),
      cleanupCandidate(f, "retry_1", "expired"),
      cleanupCandidate(f, "retry_2", "expired"),
    ];
    const active = [
      cleanupCandidate(f, "shared", "active"),
      cleanupCandidate(f, "active_1", "active"),
      cleanupCandidate(f, "active_2", "active"),
    ];
    useCleanupQueues(f, retryable, active);

    await expect(
      runPhotoUploadCleanup({ ...f, batchSize: 4 }),
    ).resolves.toMatchObject({
      expiredSessions: 4,
      failures: 0,
    });

    const processed = f.service.retrievePhotoAsset.mock.calls.map(
      ([assetId]) => assetId,
    );
    expect(processed).toEqual([
      "asset_shared",
      "asset_retry_1",
      "asset_active_1",
      "asset_retry_2",
    ]);
    expect(new Set(processed)).toHaveLength(4);
    expect(f.storage.delete).toHaveBeenCalledTimes(4);
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
