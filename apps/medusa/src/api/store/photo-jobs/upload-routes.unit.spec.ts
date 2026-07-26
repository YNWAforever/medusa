import { describe, expect, it, vi } from "vitest";
import { PhotoStorageError } from "../../../modules/photo-storage/types";
import {
  createMedusaUploadOperations,
  handleAbort,
  handleComplete,
  handleCreateUpload,
  handleSignPart,
  type UploadOperations,
} from "./[id]/uploads/handlers";

const secret = "gqVvUs6_vDW0BsZO8B0Kjt6fKLsWbX8WGkzev2TI17Y";
const req = (
  body: unknown = {},
  params: Record<string, string> = { id: "phjob_1" },
) => ({
  body,
  params,
  headers: {
    get: (name: string) => (name === "x-fotomax-guest-token" ? secret : null),
  },
});
const res = () => ({ json: vi.fn() });
const asset = {
  id: "phast_1",
  job_id: "phjob_1",
  display_name: "x.jpg",
  object_key:
    "photo-jobs/123e4567-e89b-12d3-a456-426614174000/originals/123e4567-e89b-12d3-a456-426614174001",
  expected_bytes: 12,
  reported_mime_type: "image/jpeg",
  detected_mime_type: "image/jpeg",
  storage_provider: "s3",
  status: "uploading",
};
const session = {
  id: "phups_1",
  asset_id: "phast_1",
  source_idempotency_key: "idem",
  provider_upload_id: "provider-secret",
  part_size: 8388608,
  expected_bytes: 12,
  storage_provider: "s3",
  upload_strategy: "multipart",
  completion_metadata: null,
  status: "active",
  expires_at: new Date(Date.now() + 60000),
};
const directAsset = { ...asset, storage_provider: "vercel-blob" };
const directSession = {
  ...session,
  provider_upload_id: null,
  part_size: 12,
  storage_provider: "vercel-blob",
  upload_strategy: "single-put",
  completion_metadata: null,
};
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 1]);

function ops(overrides: Partial<UploadOperations> = {}): UploadOperations {
  return {
    assertOwnedJob: vi.fn(async () => ({ id: "phjob_1", status: "draft" })),
    findSessionByIdempotencyKey: vi.fn(async () => null),
    createAssetAndSession: vi.fn(async () => ({
      asset,
      session,
      created: true,
    })),
    findOwnedSession: vi.fn(async () => ({ asset, session })),
    completeSession: vi.fn(async () => ({ ...asset, status: "uploaded" })),
    publishUploaded: vi.fn(async () => undefined),
    abortSession: vi.fn(async () => ({ ...asset, status: "failed" })),
    failSession: vi.fn(async () => ({
      asset: { ...asset, status: "failed" },
      claimed: true,
    })),
    storage: {
      defaultProvider: "vercel-blob",
      createDirectUpload: vi.fn(async () => ({
        provider: "vercel-blob" as const,
        url: "https://private.blob.example/upload",
        expiresAt: "2026-07-26T12:15:00.000Z",
        requiredHeaders: { "content-type": "image/jpeg" },
      })),
      inspect: vi.fn(async () => ({
        bytes: 12,
        contentType: "image/jpeg",
        etag: "etag",
      })),
      readPrefix: vi.fn(async () => jpeg),
      read: vi.fn(),
      writePreview: vi.fn(),
      signRead: vi.fn(),
      delete: vi.fn(),
      startLegacyMultipart: vi.fn(async () => ({
        uploadId: "provider-secret",
      })),
      signLegacyPart: vi.fn(async () => ({
        provider: "s3" as const,
        url: "https://upload",
        expiresAt: new Date().toISOString(),
        requiredHeaders: {},
      })),
      completeLegacyMultipart: vi.fn(async () => ({ etag: "etag" })),
      abortLegacyMultipart: vi.fn(),
    },
    ...overrides,
  };
}
const createBody = {
  filename: "x.jpg",
  reportedMime: "image/jpeg",
  bytes: 12,
  sourceIdempotencyKey: "idem",
  signatureBase64: Buffer.from(jpeg).toString("base64"),
};
const parts = [{ partNumber: 1, etag: "a", checksumCRC32C: "hRHAOg==" }];

describe("hardened multipart upload lifecycle", () => {
  it("rejects terminal jobs before starting provider storage", async () => {
    const operations = ops({
      assertOwnedJob: vi.fn(async () => ({
        id: "phjob_1",
        status: "cancelled",
      })),
    });
    await expect(
      handleCreateUpload(req(createBody), res(), operations),
    ).rejects.toThrow("photo_upload_not_active");
    expect(operations.storage.createDirectUpload).not.toHaveBeenCalled();
  });

  it("issues a provider-neutral single-PUT grant with bounded immutable constraints", async () => {
    const response = res();
    const operations = ops({
      createAssetAndSession: vi.fn(async () => ({
        asset: { ...asset, storage_provider: "vercel-blob" },
        session: {
          ...session,
          provider_upload_id: null,
          part_size: 12,
          storage_provider: "vercel-blob",
          upload_strategy: "single-put",
        },
        created: true,
      })),
    });

    await handleCreateUpload(req(createBody), response, operations);

    expect(operations.storage.createDirectUpload).toHaveBeenCalledWith({
      provider: "vercel-blob",
      key: expect.stringMatching(
        /^photo-jobs\/[0-9a-f-]+\/originals\/[0-9a-f-]+$/,
      ),
      contentType: "image/jpeg",
      maxBytes: 12,
      expiresIn: 900,
    });
    expect(operations.storage.createDirectUpload).toHaveBeenCalledTimes(1);
    const grantInput = vi.mocked(operations.storage.createDirectUpload).mock
      .calls[0][0];
    expect(operations.createAssetAndSession).toHaveBeenCalledWith(
      expect.objectContaining({
        objectKey: grantInput.key,
        expectedBytes: 12,
        provider: "vercel-blob",
        uploadStrategy: "single-put",
        providerUploadId: null,
        partSize: 12,
        completionMetadata: null,
        expiresAt: new Date("2026-07-26T12:15:00.000Z"),
      }),
    );
    expect(response.json).toHaveBeenCalledWith({
      upload: {
        assetId: asset.id,
        sessionId: session.id,
        strategy: "single-put",
        uploadUrl: "https://private.blob.example/upload",
        requiredHeaders: { "content-type": "image/jpeg" },
        status: "active",
        expiresAt: "2026-07-26T12:15:00.000Z",
      },
    });
    expect(JSON.stringify(vi.mocked(response.json).mock.calls)).not.toContain(
      "provider-secret",
    );
  });

  it("does not expose provider tokens returned in unsafe grant headers", async () => {
    const response = res();
    const storage = ops().storage;
    vi.mocked(storage.createDirectUpload).mockResolvedValue({
      provider: "vercel-blob",
      url: "https://private.blob.example/upload",
      expiresAt: "2026-07-26T12:15:00.000Z",
      requiredHeaders: {
        "content-type": "image/jpeg",
        authorization: "Bearer BLOB_READ_WRITE_TOKEN",
        "x-provider-token": "provider-secret",
      },
    });
    const operations = ops({
      storage,
      createAssetAndSession: vi.fn(async () => ({
        asset: { ...asset, storage_provider: "vercel-blob" },
        session: {
          ...session,
          provider_upload_id: null,
          storage_provider: "vercel-blob",
          upload_strategy: "single-put",
        },
        created: true,
      })),
    });

    await handleCreateUpload(req(createBody), response, operations);

    expect(response.json).toHaveBeenCalledWith({
      upload: expect.objectContaining({
        requiredHeaders: { "content-type": "image/jpeg" },
      }),
    });
    expect(JSON.stringify(vi.mocked(response.json).mock.calls)).not.toContain(
      "TOKEN",
    );
    expect(JSON.stringify(vi.mocked(response.json).mock.calls)).not.toContain(
      "provider-secret",
    );
  });

  it("reconciles a completed idempotent single-PUT session without issuing a grant", async () => {
    const response = res();
    const completed = {
      asset: { ...directAsset, status: "uploaded" },
      session: { ...directSession, status: "completed" },
    };
    const operations = ops({
      findSessionByIdempotencyKey: vi.fn(async () => completed),
    });

    await handleCreateUpload(req(createBody), response, operations);

    expect(response.json).toHaveBeenCalledWith({
      upload: {
        assetId: directAsset.id,
        sessionId: directSession.id,
        strategy: "single-put",
        status: "completed",
        expiresAt: new Date(directSession.expires_at).toISOString(),
      },
    });
    expect(operations.storage.createDirectUpload).not.toHaveBeenCalled();
    expect(operations.storage.inspect).not.toHaveBeenCalled();
    expect(operations.storage.readPrefix).not.toHaveBeenCalled();
    expect(operations.storage.delete).not.toHaveBeenCalled();
    expect(operations.createAssetAndSession).not.toHaveBeenCalled();
  });
  it.each([
    {
      label: "aborted session",
      asset: { ...directAsset, status: "failed" },
      session: { ...directSession, status: "aborted" },
      error: "photo_upload_not_active",
    },
    {
      label: "failed asset",
      asset: { ...directAsset, status: "failed" },
      session: directSession,
      error: "photo_upload_not_active",
    },
    {
      label: "expired active session",
      asset: directAsset,
      session: { ...directSession, expires_at: new Date(0) },
      error: "photo_upload_expired",
    },
  ])("does not re-sign an idempotent $label", async (existing) => {
    const operations = ops({
      findSessionByIdempotencyKey: vi.fn(async () => existing),
    });

    await expect(
      handleCreateUpload(req(createBody), res(), operations),
    ).rejects.toThrow(existing.error);

    expect(operations.storage.createDirectUpload).not.toHaveBeenCalled();
    expect(operations.createAssetAndSession).not.toHaveBeenCalled();
  });

  it("preserves the winner object when an idempotency race resolves to the granted pathname", async () => {
    const operations = ops({
      createAssetAndSession: vi.fn(async (input: any) => ({
        asset: {
          ...directAsset,
          id: "winner",
          object_key: input.objectKey,
        },
        session: {
          ...directSession,
          id: "winner-session",
        },
        created: false,
      })),
    });

    await handleCreateUpload(req(createBody), res(), operations);

    expect(operations.storage.delete).not.toHaveBeenCalled();
    expect(operations.storage.createDirectUpload).toHaveBeenCalledTimes(1);
  });
  it("deletes a newly granted pathname when a concurrent create returns the winner", async () => {
    const winner = {
      asset: {
        ...asset,
        id: "winner",
        storage_provider: "vercel-blob",
      },
      session: {
        ...session,
        id: "winner-session",
        provider_upload_id: null,
        storage_provider: "vercel-blob",
        upload_strategy: "single-put",
      },
      created: false,
    };
    const operations = ops({
      createAssetAndSession: vi.fn(async () => winner),
    });

    await handleCreateUpload(req(createBody), res(), operations);

    const issuedKey = vi.mocked(operations.storage.createDirectUpload).mock
      .calls[0][0].key;
    expect(operations.storage.delete).toHaveBeenCalledWith([
      { provider: "vercel-blob", key: issuedKey },
    ]);
    expect(operations.storage.createDirectUpload).toHaveBeenCalledTimes(2);
  });

  it("cleans a distinct race grant and reconciles a terminal winner", async () => {
    const winner = {
      asset: { ...directAsset, status: "uploaded" },
      session: { ...directSession, status: "completed" },
      created: false,
    };
    const operations = ops({
      createAssetAndSession: vi.fn(async () => winner),
    });
    const response = res();

    await handleCreateUpload(req(createBody), response, operations);

    const issuedKey = vi.mocked(operations.storage.createDirectUpload)
      .mock.calls[0][0].key;
    expect(operations.storage.delete).toHaveBeenCalledWith([
      { provider: "vercel-blob", key: issuedKey },
    ]);
    expect(operations.storage.createDirectUpload).toHaveBeenCalledTimes(1);
    expect(response.json).toHaveBeenCalledWith({
      upload: {
        assetId: directAsset.id,
        sessionId: directSession.id,
        strategy: "single-put",
        status: "completed",
        expiresAt: new Date(directSession.expires_at).toISOString(),
      },
    });
  });

  it("reconciles an already completed provider object without completing it twice", async () => {
    const operations = ops();
    await handleComplete(
      req({ parts }, { id: "phjob_1", sessionId: "phups_1" }),
      res(),
      operations,
    );
    expect(operations.storage.completeLegacyMultipart).not.toHaveBeenCalled();
    expect(operations.storage.readPrefix).toHaveBeenCalledWith(
      { provider: "s3", key: asset.object_key },
      12,
    );
    expect(operations.completeSession).toHaveBeenCalled();
  });

  it("replays the exact completed manifest after processing advances the asset", async () => {
    const response = res();
    const operations = ops({
      findOwnedSession: vi.fn(async () => ({
        asset: { ...asset, status: "ready" },
        session: { ...session, status: "completed", completed_parts: parts },
      })),
    });

    await handleComplete(
      req({ parts }, { id: "phjob_1", sessionId: "phups_1" }),
      response,
      operations,
    );

    expect(response.json).toHaveBeenCalledWith({
      asset: expect.objectContaining({ id: asset.id, status: "ready" }),
    });
    expect(operations.completeSession).not.toHaveBeenCalled();
    expect(operations.publishUploaded).toHaveBeenCalledWith(
      expect.objectContaining({ id: asset.id, status: "ready" }),
    );
    await expect(
      handleComplete(
        req(
          { parts: [{ ...parts[0], etag: "different" }] },
          { id: "phjob_1", sessionId: "phups_1" },
        ),
        res(),
        operations,
      ),
    ).rejects.toThrow("photo_upload_completion_mismatch");
  });
  it("retries event publication after the upload commit wins", async () => {
    const uploaded = { ...asset, status: "uploaded" };
    const publishUploaded = vi
      .fn()
      .mockRejectedValueOnce(new Error("event bus unavailable"))
      .mockResolvedValueOnce(undefined);
    const operations = ops({
      findOwnedSession: vi
        .fn()
        .mockResolvedValueOnce({ asset, session })
        .mockResolvedValueOnce({
          asset: uploaded,
          session: { ...session, status: "completed", completed_parts: parts },
        }),
      completeSession: vi.fn(async () => uploaded),
      publishUploaded,
    });

    await handleComplete(
      req({ parts }, { id: "phjob_1", sessionId: "phups_1" }),
      res(),
      operations,
    );

    expect(operations.completeSession).toHaveBeenCalledTimes(1);
    expect(publishUploaded).toHaveBeenCalledTimes(2);
  });

  it("reconciles an existing provider object after session expiry", async () => {
    const operations = ops({
      findOwnedSession: vi.fn(async () => ({
        asset,
        session: { ...session, expires_at: new Date(0) },
      })),
    });

    await handleComplete(
      req({ parts }, { id: "phjob_1", sessionId: "phups_1" }),
      res(),
      operations,
    );
    expect(operations.storage.completeLegacyMultipart).not.toHaveBeenCalled();
    expect(operations.completeSession).toHaveBeenCalled();
  });

  it("completes a missing object then validates the actual stored signature", async () => {
    const storage = ops().storage;
    (storage.inspect as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new PhotoStorageError("photo_storage_not_found"))
      .mockResolvedValueOnce({
        bytes: 12,
        contentType: "image/jpeg",
        etag: "etag",
      });
    const operations = ops({ storage });
    await handleComplete(
      req({ parts }, { id: "phjob_1", sessionId: "phups_1" }),
      res(),
      operations,
    );
    expect(storage.completeLegacyMultipart).toHaveBeenCalledTimes(1);
    expect(storage.readPrefix).toHaveBeenCalled();
  });

  it("deletes invalid stored bytes and records a stable failed state", async () => {
    const storage = {
      ...ops().storage,
      readPrefix: vi.fn(async () => Uint8Array.from([1, 2, 3])),
    };
    const operations = ops({ storage });
    await expect(
      handleComplete(
        req({ parts }, { id: "phjob_1", sessionId: "phups_1" }),
        res(),
        operations,
      ),
    ).rejects.toThrow("photo_upload_metadata_mismatch");
    expect(storage.delete).toHaveBeenCalledWith([
      { provider: "s3", key: asset.object_key },
    ]);
    expect(operations.failSession).toHaveBeenCalled();
  });

  it("keeps the active session recoverable on transient storage inspection errors", async () => {
    const storage = {
      ...ops().storage,
      readPrefix: vi.fn(async () => {
        throw new PhotoStorageError("photo_storage_provider_error");
      }),
    };
    const operations = ops({ storage });
    await expect(
      handleComplete(
        req({ parts }, { id: "phjob_1", sessionId: "phups_1" }),
        res(),
        operations,
      ),
    ).rejects.toThrow("photo_storage_provider_error");
    expect(operations.failSession).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("preserves a valid completed object when the database commit fails", async () => {
    const operations = ops({
      completeSession: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });

    await expect(
      handleComplete(
        req({ parts }, { id: "phjob_1", sessionId: "phups_1" }),
        res(),
        operations,
      ),
    ).rejects.toThrow("database unavailable");
    expect(operations.storage.delete).not.toHaveBeenCalled();
    expect(operations.failSession).not.toHaveBeenCalled();
  });

  it("resumes cleanup for an already aborted session", async () => {
    const operations = ops({
      findOwnedSession: vi.fn(async () => ({
        asset: { ...asset, status: "failed" },
        session: { ...session, status: "aborted" },
      })),
    });
    await handleAbort(
      req({}, { id: "phjob_1", sessionId: "phups_1" }),
      res(),
      operations,
    );
    expect(operations.abortSession).not.toHaveBeenCalled();
    expect(operations.storage.abortLegacyMultipart).toHaveBeenCalled();
    expect(operations.storage.delete).toHaveBeenCalledWith([
      { provider: "s3", key: asset.object_key },
    ]);
  });
  it("claims the abort state before touching provider storage", async () => {
    const order: string[] = [];
    const operations = ops({
      abortSession: vi.fn(async () => {
        order.push("db");
        return { ...asset, status: "failed" };
      }),
      storage: {
        ...ops().storage,
        abortLegacyMultipart: vi.fn(async () => {
          order.push("provider");
        }),
      },
    });
    await handleAbort(
      req({}, { id: "phjob_1", sessionId: "phups_1" }),
      res(),
      operations,
    );
    expect(order).toEqual(["db", "provider"]);
  });
});

describe("provider-neutral single-PUT lifecycle", () => {
  it.each([
    { body: { etag: "" }, label: "an empty ETag" },
    { body: { etag: "   " }, label: "a blank ETag" },
    { body: { etag: "etag", parts: [] }, label: "extra completion metadata" },
  ])("rejects $label before object access", async ({ body }) => {
    const operations = ops({
      findOwnedSession: vi.fn(async () => ({
        asset: directAsset,
        session: directSession,
      })),
    });

    await expect(
      handleComplete(
        req(body, { id: "phjob_1", sessionId: "phups_1" }),
        res(),
        operations,
      ),
    ).rejects.toThrow("photo_upload_invalid_input");
    expect(operations.storage.inspect).not.toHaveBeenCalled();
    expect(operations.storage.readPrefix).not.toHaveBeenCalled();
  });

  it("validates and completes one exact ETag through the recorded provider", async () => {
    const response = res();
    const storage = ops().storage;
    vi.mocked(storage.inspect).mockResolvedValue({
      bytes: 12,
      contentType: "image/jpeg",
      etag: "etag-direct",
    });
    const operations = ops({
      storage,
      findOwnedSession: vi.fn(async () => ({
        asset: directAsset,
        session: directSession,
      })),
    });

    await handleComplete(
      req({ etag: "etag-direct" }, { id: "phjob_1", sessionId: "phups_1" }),
      response,
      operations,
    );

    const ref = { provider: "vercel-blob" as const, key: asset.object_key };
    expect(storage.inspect).toHaveBeenCalledWith(ref);
    expect(storage.readPrefix).toHaveBeenCalledWith(ref, 12);
    expect(operations.completeSession).toHaveBeenCalledWith(
      directAsset,
      directSession,
      { bytes: 12, etag: "etag-direct" },
    );
    expect(operations.publishUploaded).toHaveBeenCalledTimes(1);
    expect(response.json).toHaveBeenCalledWith({
      asset: expect.objectContaining({ status: "uploaded" }),
    });
  });

  it("replays only the ETag stored in completion metadata", async () => {
    const response = res();
    const completed = {
      asset: {
        ...directAsset,
        provider_etag: "provider-etag-must-not-authorize-replay",
        status: "ready",
      },
      session: {
        ...directSession,
        status: "completed",
        completion_metadata: { etag: "stored-etag" },
      },
    };
    const operations = ops({
      findOwnedSession: vi.fn(async () => completed),
    });

    await handleComplete(
      req({ etag: "stored-etag" }, { id: "phjob_1", sessionId: "phups_1" }),
      response,
      operations,
    );

    expect(operations.storage.inspect).not.toHaveBeenCalled();
    expect(operations.publishUploaded).toHaveBeenCalledWith(completed.asset);
    await expect(
      handleComplete(
        req(
          { etag: completed.asset.provider_etag },
          { id: "phjob_1", sessionId: "phups_1" },
        ),
        res(),
        operations,
      ),
    ).rejects.toThrow("photo_upload_completion_mismatch");
  });

  it.each([
    {
      label: "byte count",
      inspect: { bytes: 11, contentType: "image/jpeg", etag: "etag-direct" },
      prefix: jpeg,
      code: "photo_upload_size_mismatch",
    },
    {
      label: "content type",
      inspect: { bytes: 12, contentType: "image/png", etag: "etag-direct" },
      prefix: jpeg,
      code: "photo_upload_metadata_mismatch",
    },
    {
      label: "magic bytes",
      inspect: { bytes: 12, contentType: "image/jpeg", etag: "etag-direct" },
      prefix: Uint8Array.from([1, 2, 3]),
      code: "photo_upload_metadata_mismatch",
    },
    {
      label: "ETag",
      inspect: { bytes: 12, contentType: "image/jpeg", etag: "other-etag" },
      prefix: jpeg,
      code: "photo_upload_completion_mismatch",
    },
  ])("deletes and marks $label mismatches retryable without an event", async ({
    inspect,
    prefix,
    code,
  }) => {
    const storage = ops().storage;
    vi.mocked(storage.inspect).mockResolvedValue(inspect);
    vi.mocked(storage.readPrefix).mockResolvedValue(prefix);
    const operations = ops({
      storage,
      findOwnedSession: vi.fn(async () => ({
        asset: directAsset,
        session: directSession,
      })),
    });

    await expect(
      handleComplete(
        req(
          { etag: "etag-direct" },
          { id: "phjob_1", sessionId: "phups_1" },
        ),
        res(),
        operations,
      ),
    ).rejects.toThrow(code);

    expect(storage.delete).toHaveBeenCalledWith([
      { provider: "vercel-blob", key: asset.object_key },
    ]);
    expect(operations.failSession).toHaveBeenCalledWith(
      directAsset,
      directSession,
      code,
    );
    expect(vi.mocked(operations.failSession).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(storage.delete).mock.invocationCallOrder[0],
    );
    expect(operations.completeSession).not.toHaveBeenCalled();
    expect(operations.publishUploaded).not.toHaveBeenCalled();
  });

  it("does not delete when a competing completion wins the terminal transition", async () => {
    const storage = ops().storage;
    vi.mocked(storage.inspect).mockResolvedValue({
      bytes: 12,
      contentType: "image/jpeg",
      etag: "different-etag",
    });
    const operations = ops({
      storage,
      findOwnedSession: vi.fn(async () => ({
        asset: directAsset,
        session: directSession,
      })),
      failSession: vi.fn(async () => ({
        asset: { ...directAsset, status: "uploaded" },
        claimed: false,
      })),
    });

    await expect(
      handleComplete(
        req(
          { etag: "etag-direct" },
          { id: "phjob_1", sessionId: "phups_1" },
        ),
        res(),
        operations,
      ),
    ).rejects.toThrow("photo_upload_completion_mismatch");

    expect(operations.failSession).toHaveBeenCalledTimes(1);
    expect(storage.delete).not.toHaveBeenCalled();
    expect(operations.publishUploaded).not.toHaveBeenCalled();
  });

  it("keeps the stable mismatch after a claimed failure when deletion fails", async () => {
    const order: string[] = [];
    const storage = ops().storage;
    vi.mocked(storage.inspect).mockResolvedValue({
      bytes: 12,
      contentType: "image/jpeg",
      etag: "different-etag",
    });
    vi.mocked(storage.delete).mockImplementation(async () => {
      order.push("delete");
      throw new PhotoStorageError("photo_storage_provider_error");
    });
    const operations = ops({
      storage,
      findOwnedSession: vi.fn(async () => ({
        asset: directAsset,
        session: directSession,
      })),
      failSession: vi.fn(async () => {
        order.push("claim");
        return {
          asset: { ...directAsset, status: "failed" },
          claimed: true,
        };
      }),
    });

    await expect(
      handleComplete(
        req(
          { etag: "etag-direct" },
          { id: "phjob_1", sessionId: "phups_1" },
        ),
        res(),
        operations,
      ),
    ).rejects.toThrow("photo_upload_completion_mismatch");

    expect(order).toEqual(["claim", "delete"]);
    expect(operations.failSession).toHaveBeenCalledTimes(1);
    expect(operations.publishUploaded).not.toHaveBeenCalled();
  });
  it("fails provider mismatch before any object access", async () => {
    const operations = ops({
      findOwnedSession: vi.fn(async () => ({
        asset: directAsset,
        session: { ...directSession, storage_provider: "s3" },
      })),
    });

    await expect(
      handleComplete(
        req(
          { etag: "etag-direct" },
          { id: "phjob_1", sessionId: "phups_1" },
        ),
        res(),
        operations,
      ),
    ).rejects.toThrow("photo_storage_provider_mismatch");
    expect(operations.storage.inspect).not.toHaveBeenCalled();
    expect(operations.storage.readPrefix).not.toHaveBeenCalled();
    expect(operations.storage.delete).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "single-PUT strategy",
      asset,
      session: { ...session, upload_strategy: "single-put" },
    },
    {
      label: "non-S3 provider",
      asset: directAsset,
      session: { ...directSession, upload_strategy: "multipart" },
    },
  ])("rejects $label on the parts route", async (found) => {
    const operations = ops({
      findOwnedSession: vi.fn(async () => found),
    });

    await expect(
      handleSignPart(
        req(
          { partNumber: 1, checksumCRC32C: "hRHAOg==" },
          { id: "phjob_1", sessionId: "phups_1" },
        ),
        res(),
        operations,
      ),
    ).rejects.toThrow("photo_upload_not_active");
    expect(operations.storage.signLegacyPart).not.toHaveBeenCalled();
  });

  it("keeps existing S3 multipart part signing resumable", async () => {
    const operations = ops();

    await handleSignPart(
      req(
        { partNumber: 1, checksumCRC32C: "hRHAOg==" },
        { id: "phjob_1", sessionId: "phups_1" },
      ),
      res(),
      operations,
    );

    expect(operations.storage.signLegacyPart).toHaveBeenCalledWith({
      provider: "s3",
      key: asset.object_key,
      uploadId: "provider-secret",
      partNumber: 1,
      checksumCRC32C: "hRHAOg==",
      expiresIn: 900,
    });
  });
});

describe("serializable upload operations", () => {
  function medusaOperations(service: Record<string, any>) {
    const storage = ops().storage;
    const eventBus = { emit: vi.fn() };
    return createMedusaUploadOperations({
      headers: { get: () => null },
      auth_context: { actor_id: "cus_1" },
      scope: {
        resolve: (name: string) =>
          name === "event_bus" ? eventBus : name.includes("storage") ? storage : service,
      },
    });
  }

  it("enforces limits inside the serializable shared context", async () => {
    const context = { transactionManager: {} };
    const service = {
      withPhotoJobTransaction: vi.fn(async (callback, options) => {
        expect(options).toEqual({ isolationLevel: "serializable" });
        return callback(context);
      }),
      listPhotoUploadSessions: vi.fn(async () => []),
      retrievePhotoJob: vi.fn(async () => ({ id: "phjob_1", status: "draft" })),
      listPhotoAssets: vi.fn(async () =>
        Array.from({ length: 500 }, () => ({
          status: "uploading",
          expected_bytes: 1,
        })),
      ),
      createPhotoAssets: vi.fn(),
    };
    const operations = medusaOperations(service);
    await expect(
      operations.createAssetAndSession({
        jobId: "phjob_1",
        displayName: "x.jpg",
        objectKey: asset.object_key,
        reportedMime: "image/jpeg",
        detectedMime: "image/jpeg",
        expectedBytes: 12,
        idempotencyKey: "new",
        provider: "vercel-blob",
        uploadStrategy: "single-put",
        providerUploadId: null,
        partSize: 12,
        completionMetadata: null,
        expiresAt: new Date(),
      }),
    ).rejects.toThrow("photo_asset_limit_exceeded");
    expect(service.listPhotoUploadSessions).toHaveBeenCalledWith(
      { source_idempotency_key: "phjob_1:new" },
      {},
      context,
    );
    expect(service.retrievePhotoJob).toHaveBeenCalledWith(
      "phjob_1",
      undefined,
      context,
    );
    expect(service.listPhotoAssets).toHaveBeenCalledWith(
      { job_id: "phjob_1" },
      {},
      context,
    );
    expect(service.createPhotoAssets).not.toHaveBeenCalled();
  });

  it("persists the grant provider and single-PUT strategy on asset and session", async () => {
    const context = { transactionManager: {} };
    const createdAsset = { ...directAsset };
    const createdSession = { ...directSession };
    const service = {
      withPhotoJobTransaction: vi.fn(async (callback) => callback(context)),
      listPhotoUploadSessions: vi.fn(async () => []),
      retrievePhotoJob: vi.fn(async () => ({ id: "phjob_1", status: "uploading" })),
      listPhotoAssets: vi.fn(async () => []),
      createPhotoAssets: vi.fn(async () => createdAsset),
      createPhotoUploadSessions: vi.fn(async () => createdSession),
    };
    const operations = medusaOperations(service);

    await expect(
      operations.createAssetAndSession({
        jobId: "phjob_1",
        displayName: "x.jpg",
        objectKey: asset.object_key,
        reportedMime: "image/jpeg",
        detectedMime: "image/jpeg",
        expectedBytes: 12,
        idempotencyKey: "new",
        provider: "vercel-blob",
        uploadStrategy: "single-put",
        providerUploadId: null,
        partSize: 12,
        completionMetadata: null,
        expiresAt: new Date("2026-07-26T12:15:00.000Z"),
      }),
    ).resolves.toEqual({
      asset: createdAsset,
      session: createdSession,
      created: true,
    });
    expect(service.createPhotoAssets).toHaveBeenCalledWith(
      expect.objectContaining({ storage_provider: "vercel-blob" }),
      context,
    );
    expect(service.createPhotoUploadSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        storage_provider: "vercel-blob",
        upload_strategy: "single-put",
        provider_upload_id: null,
        part_size: 12,
        completion_metadata: null,
      }),
      context,
    );
  });

  it("persists single-PUT completion metadata and the provider ETag atomically", async () => {
    const context = { transactionManager: {} };
    const uploaded = {
      ...directAsset,
      status: "uploaded",
      stored_bytes: 12,
      provider_etag: "etag-direct",
    };
    const service = {
      withPhotoJobTransaction: vi.fn(async (callback) => callback(context)),
      listPhotoUploadSessions: vi.fn(async () => [directSession]),
      retrievePhotoAsset: vi.fn(async () => directAsset),
      updatePhotoUploadSessions: vi.fn(async () => [
        {
          ...directSession,
          status: "completed",
          completion_metadata: { etag: "etag-direct" },
        },
      ]),
      updatePhotoAssets: vi.fn(async () => [uploaded]),
    };
    const operations = medusaOperations(service);

    await expect(
      operations.completeSession(directAsset, directSession, {
        bytes: 12,
        etag: "etag-direct",
      }),
    ).resolves.toEqual(uploaded);
    expect(service.updatePhotoUploadSessions).toHaveBeenCalledWith(
      {
        selector: { id: directSession.id, status: "active" },
        data: {
          status: "completed",
          completed_at: expect.any(Date),
          completion_metadata: { etag: "etag-direct" },
        },
      },
      context,
    );
    expect(service.updatePhotoAssets).toHaveBeenCalledWith(
      {
        selector: { id: directAsset.id, status: "uploading" },
        data: {
          status: "uploaded",
          stored_bytes: 12,
          provider_etag: "etag-direct",
          uploaded_at: expect.any(Date),
          failure_code: null,
        },
      },
      context,
    );
  });
  it("reports a lost failure claim when completion wins the conditional race", async () => {
    const context = { transactionManager: {} };
    const uploaded = { ...directAsset, status: "uploaded" };
    const service = {
      withPhotoJobTransaction: vi.fn(async (callback) => callback(context)),
      listPhotoUploadSessions: vi
        .fn()
        .mockResolvedValueOnce([directSession])
        .mockResolvedValueOnce([
          {
            ...directSession,
            status: "completed",
            completion_metadata: { etag: "winner-etag" },
          },
        ]),
      retrievePhotoAsset: vi
        .fn()
        .mockResolvedValueOnce(directAsset)
        .mockResolvedValueOnce(uploaded),
      updatePhotoUploadSessions: vi.fn(async () => []),
      updatePhotoAssets: vi.fn(),
    };
    const operations = medusaOperations(service);

    await expect(
      operations.failSession(
        directAsset,
        directSession,
        "photo_upload_completion_mismatch",
      ),
    ).resolves.toEqual({ asset: uploaded, claimed: false });

    expect(service.updatePhotoAssets).not.toHaveBeenCalled();
  });
  it("reports a lost failure claim when another failure wins the conditional race", async () => {
    const context = { transactionManager: {} };
    const failed = { ...directAsset, status: "failed" };
    const service = {
      withPhotoJobTransaction: vi.fn(async (callback) => callback(context)),
      listPhotoUploadSessions: vi
        .fn()
        .mockResolvedValueOnce([directSession])
        .mockResolvedValueOnce([{ ...directSession, status: "aborted" }]),
      retrievePhotoAsset: vi
        .fn()
        .mockResolvedValueOnce(directAsset)
        .mockResolvedValueOnce(failed),
      updatePhotoUploadSessions: vi.fn(async () => []),
      updatePhotoAssets: vi.fn(),
    };
    const operations = medusaOperations(service);

    await expect(
      operations.failSession(
        directAsset,
        directSession,
        "photo_upload_completion_mismatch",
      ),
    ).resolves.toEqual({ asset: failed, claimed: false });

    expect(service.updatePhotoAssets).not.toHaveBeenCalled();
  });
  it("uses one context and conditional active/uploading selectors", async () => {
    const context = { transactionManager: {} };
    const uploaded = { ...asset, status: "uploaded" };
    const service = {
      withPhotoJobTransaction: vi.fn(async (callback, options) => {
        expect(options).toEqual({ isolationLevel: "serializable" });
        return callback(context);
      }),
      listPhotoUploadSessions: vi.fn(async () => [session]),
      retrievePhotoAsset: vi.fn(async () => asset),
      updatePhotoUploadSessions: vi.fn(async () => [
        { ...session, status: "completed" },
      ]),
      updatePhotoAssets: vi.fn(async () => [uploaded]),
    };
    const operations = medusaOperations(service);
    await expect(
      operations.completeSession(asset, session, {
        bytes: 12,
        etag: "etag",
        parts,
      }),
    ).resolves.toEqual(uploaded);
    expect(service.listPhotoUploadSessions).toHaveBeenCalledWith(
      { id: session.id },
      {},
      context,
    );
    expect(service.retrievePhotoAsset).toHaveBeenCalledWith(
      asset.id,
      undefined,
      context,
    );
    expect(service.updatePhotoUploadSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        selector: { id: session.id, status: "active" },
      }),
      context,
    );
    expect(service.updatePhotoAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        selector: { id: asset.id, status: "uploading" },
      }),
      context,
    );
  });

  it("rejects empty conditional-update arrays", async () => {
    const service = {
      withPhotoJobTransaction: vi.fn(async (callback) =>
        callback({ transactionManager: {} }),
      ),
      listPhotoUploadSessions: vi.fn(async () => [session]),
      retrievePhotoAsset: vi.fn(async () => asset),
      updatePhotoUploadSessions: vi.fn(async () => []),
      updatePhotoAssets: vi.fn(),
    };
    const operations = medusaOperations(service);

    await expect(
      operations.completeSession(asset, session, {
        bytes: 12,
        etag: "etag",
        parts,
      }),
    ).rejects.toThrow("photo_upload_not_active");
    expect(service.updatePhotoAssets).not.toHaveBeenCalled();
  });

  it("rejects terminal overwrite before conditional updates", async () => {
    const service = {
      withPhotoJobTransaction: vi.fn(async (callback) =>
        callback({ transactionManager: {} }),
      ),
      listPhotoUploadSessions: vi.fn(async () => [
        { ...session, status: "completed" },
      ]),
      retrievePhotoAsset: vi.fn(async () => ({ ...asset, status: "uploaded" })),
      updatePhotoUploadSessions: vi.fn(),
      updatePhotoAssets: vi.fn(),
    };
    const operations = medusaOperations(service);
    await expect(operations.abortSession(asset, session)).rejects.toThrow(
      "photo_upload_not_active",
    );
    expect(service.updatePhotoUploadSessions).not.toHaveBeenCalled();
    expect(service.updatePhotoAssets).not.toHaveBeenCalled();
  });
});
