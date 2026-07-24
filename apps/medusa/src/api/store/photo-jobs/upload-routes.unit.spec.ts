import { describe, expect, it, vi } from "vitest";
import { PhotoStorageError } from "../../../modules/photo-storage/types";
import {
  createMedusaUploadOperations,
  handleAbort,
  handleComplete,
  handleCreateUpload,
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
  status: "uploading",
};
const session = {
  id: "phups_1",
  asset_id: "phast_1",
  source_idempotency_key: "idem",
  provider_upload_id: "provider-secret",
  part_size: 8388608,
  expected_bytes: 12,
  status: "active",
  expires_at: new Date(Date.now() + 60000),
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
    failSession: vi.fn(async () => ({ ...asset, status: "failed" })),
    storage: {
      startMultipartUpload: vi.fn(async () => ({
        uploadId: "provider-secret",
      })),
      signUploadPart: vi.fn(async () => ({
        url: "https://upload",
        expiresAt: new Date().toISOString(),
        requiredHeaders: {},
      })),
      completeMultipartUpload: vi.fn(async () => ({
        etag: "etag",
        checksumCRC32C: "hRHAOg==",
      })),
      abortMultipartUpload: vi.fn(),
      headPrivateObject: vi.fn(async () => ({
        bytes: 12,
        contentType: "image/jpeg",
        checksumCRC32C: "hRHAOg==",
      })),
      readPrivateObjectPrefix: vi.fn(async () => jpeg),
      readPrivateObject: vi.fn(),
      writePrivatePreview: vi.fn(),
      signPrivateRead: vi.fn(),
      signPrivateOriginalRead: vi.fn(),
      deletePrivateObjects: vi.fn(),
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
    expect(operations.storage.startMultipartUpload).not.toHaveBeenCalled();
  });

  it("aborts an orphan provider upload when a concurrent create returns the winner", async () => {
    const winner = {
      asset: { ...asset, id: "winner" },
      session: { ...session, id: "winner-session" },
      created: false,
    };
    const operations = ops({
      createAssetAndSession: vi.fn(async () => winner),
    });
    await handleCreateUpload(req(createBody), res(), operations);
    expect(operations.storage.abortMultipartUpload).toHaveBeenCalledWith(
      expect.objectContaining({ uploadId: "provider-secret" }),
    );
  });

  it("reconciles an already completed provider object without completing it twice", async () => {
    const operations = ops();
    await handleComplete(
      req({ parts }, { id: "phjob_1", sessionId: "phups_1" }),
      res(),
      operations,
    );
    expect(operations.storage.completeMultipartUpload).not.toHaveBeenCalled();
    expect(operations.storage.readPrivateObjectPrefix).toHaveBeenCalledWith(
      asset.object_key,
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
    expect(operations.storage.completeMultipartUpload).not.toHaveBeenCalled();
    expect(operations.completeSession).toHaveBeenCalled();
  });

  it("completes a missing object then validates the actual stored signature", async () => {
    const storage = ops().storage;
    (storage.headPrivateObject as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new PhotoStorageError("photo_storage_not_found"))
      .mockResolvedValueOnce({
        bytes: 12,
        contentType: "image/jpeg",
        checksumCRC32C: "hRHAOg==",
      });
    const operations = ops({ storage });
    await handleComplete(
      req({ parts }, { id: "phjob_1", sessionId: "phups_1" }),
      res(),
      operations,
    );
    expect(storage.completeMultipartUpload).toHaveBeenCalledTimes(1);
    expect(storage.readPrivateObjectPrefix).toHaveBeenCalled();
  });

  it("deletes invalid stored bytes and records a stable failed state", async () => {
    const storage = {
      ...ops().storage,
      readPrivateObjectPrefix: vi.fn(async () => Uint8Array.from([1, 2, 3])),
    };
    const operations = ops({ storage });
    await expect(
      handleComplete(
        req({ parts }, { id: "phjob_1", sessionId: "phups_1" }),
        res(),
        operations,
      ),
    ).rejects.toThrow("photo_upload_metadata_mismatch");
    expect(storage.deletePrivateObjects).toHaveBeenCalledWith([
      asset.object_key,
    ]);
    expect(operations.failSession).toHaveBeenCalled();
  });

  it("keeps the active session recoverable on transient storage inspection errors", async () => {
    const storage = {
      ...ops().storage,
      readPrivateObjectPrefix: vi.fn(async () => {
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
    expect(storage.deletePrivateObjects).not.toHaveBeenCalled();
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
    expect(operations.storage.deletePrivateObjects).not.toHaveBeenCalled();
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
    expect(operations.storage.abortMultipartUpload).toHaveBeenCalled();
    expect(operations.storage.deletePrivateObjects).toHaveBeenCalledWith([
      asset.object_key,
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
        abortMultipartUpload: vi.fn(async () => {
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
        providerUploadId: "upload",
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
        checksumCRC32C: "hRHAOg==",
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
        checksumCRC32C: "hRHAOg==",
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
