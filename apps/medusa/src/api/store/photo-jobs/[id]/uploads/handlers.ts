import { randomUUID } from "node:crypto";
import { MedusaError } from "@medusajs/framework/utils";
import { PHOTO_PRODUCTION_MODULE } from "../../../../../modules/photo-production";
import { validatePhotoFile } from "../../../../../modules/photo-production/file-validation";
import { verifyGuestSecret } from "../../../../../modules/photo-production/ownership";
import {
  assertPhotoAssetTransition,
  assertPhotoJobTransition,
  assertUploadSessionTransition,
  type PhotoAssetStatus,
  type PhotoJobStatus,
  type PhotoUploadSessionStatus,
} from "../../../../../modules/photo-production/state-machine";
import { PHOTO_STORAGE_MODULE } from "../../../../../modules/photo-storage";
import {
  PhotoStorageError,
  photoObjectRef,
  type PhotoDirectUploadGrant,
  type PhotoObjectRef,
  type PhotoObjectStorage,
  type PhotoStorageProvider,
  type PhotoUploadStrategy,
} from "../../../../../modules/photo-storage/types";

const PART_SIZE = 8 * 1024 * 1024;
const MAX_ASSETS = 500;
const MAX_JOB_BYTES = 10 * 1024 ** 3;
const SIGNATURE_SECONDS = 900;
const SIGNATURE_PREFIX_BYTES = 12;

type Headers =
  | { get(name: string): string | null }
  | Record<string, string | string[] | undefined>;
type Request = {
  body?: unknown;
  params?: Record<string, string | undefined>;
  headers: Headers;
  auth_context?: { actor_id?: string | null };
  scope?: any;
};
type Response = { json(body: unknown): unknown };
export type UploadAsset = {
  id: string;
  job_id: string;
  display_name: string;
  object_key: string;
  expected_bytes: number;
  reported_mime_type?: string | null;
  detected_mime_type?: string | null;
  storage_provider?: string | null;
  provider_etag?: string | null;
  status: string;
  [key: string]: unknown;
};
export type UploadSession = {
  id: string;
  asset_id: string;
  source_idempotency_key: string;
  provider_upload_id?: string | null;
  part_size: number;
  expected_bytes: number;
  completed_parts?: unknown;
  completion_metadata?: unknown;
  storage_provider?: string | null;
  upload_strategy?: string | null;
  status: string;
  expires_at: Date | string;
  [key: string]: unknown;
};

type CompletedPart = {
  partNumber: number;
  etag: string;
  checksumCRC32C: string;
};

type CreateInput = {
  jobId: string;
  displayName: string;
  objectKey: string;
  reportedMime: string;
  detectedMime: string;
  expectedBytes: number;
  idempotencyKey: string;
  provider: PhotoStorageProvider;
  uploadStrategy: "single-put";
  providerUploadId: null;
  partSize: number;
  completionMetadata: null;
  expiresAt: Date;
};

type CompletionResult = {
  bytes: number;
  etag: string;
  parts?: CompletedPart[];
};

type FailureClaim = {
  asset: UploadAsset;
  claimed: boolean;
};

export interface UploadOperations {
  assertOwnedJob(
    req: Request,
    jobId: string,
  ): Promise<{ id: string; status: string }>;
  findSessionByIdempotencyKey(
    jobId: string,
    key: string,
  ): Promise<{ asset: UploadAsset; session: UploadSession } | null>;
  createAssetAndSession(
    input: CreateInput,
  ): Promise<{ asset: UploadAsset; session: UploadSession; created: boolean }>;
  findOwnedSession(
    req: Request,
    jobId: string,
    sessionId: string,
  ): Promise<{ asset: UploadAsset; session: UploadSession }>;
  completeSession(
    asset: UploadAsset,
    session: UploadSession,
    result: CompletionResult,
  ): Promise<UploadAsset>;
  publishUploaded(asset: UploadAsset): Promise<void>;
  abortSession(
    asset: UploadAsset,
    session: UploadSession,
  ): Promise<UploadAsset>;
  failSession(
    asset: UploadAsset,
    session: UploadSession,
    code: string,
  ): Promise<FailureClaim>;
  storage: PhotoObjectStorage;
}

function error(type: string, code: string): MedusaError {
  return new MedusaError(type, code);
}
function invalid(code: string): never {
  throw error(MedusaError.Types.INVALID_DATA, code);
}
function conflict(code: string): never {
  throw error(MedusaError.Types.CONFLICT, code);
}
function notFound(): never {
  throw error(MedusaError.Types.NOT_FOUND, "photo_job_not_found");
}
function transitionConflict(): never {
  return conflict("photo_upload_not_active");
}
function body(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("photo_upload_invalid_input");
  return value as Record<string, unknown>;
}
function param(req: Request, name: string): string {
  const value = req.params?.[name]?.trim();
  if (!value) notFound();
  return value;
}
function header(req: Request, name: string): string | null {
  if ("get" in req.headers && typeof req.headers.get === "function")
    return req.headers.get(name);
  const value = (req.headers as Record<string, string | string[] | undefined>)[
    name
  ];
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
function safeAsset(asset: UploadAsset) {
  const { object_key: _key, job_id: _job, ...safe } = asset;
  return safe;
}
const SAFE_UPLOAD_HEADERS = new Set([
  "content-type",
  "x-amz-server-side-encryption",
  "x-amz-checksum-crc32c",
  "x-amz-sdk-checksum-algorithm",
]);

function safeRequiredHeaders(headers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) =>
      SAFE_UPLOAD_HEADERS.has(name.toLowerCase()),
    ),
  );
}
function sessionStrategy(session: UploadSession): PhotoUploadStrategy {
  const strategy = session.upload_strategy ?? "multipart";
  if (strategy !== "multipart" && strategy !== "single-put")
    conflict("photo_upload_not_active");
  return strategy;
}
function sameRef(left: PhotoObjectRef, right: PhotoObjectRef): boolean {
  return left.provider === right.provider && left.key === right.key;
}
function recordedRef(asset: UploadAsset, session: UploadSession): PhotoObjectRef {
  const ref = photoObjectRef(asset, asset.object_key);
  const provider = session.storage_provider ?? "s3";
  if (provider !== "s3" && provider !== "vercel-blob")
    throw new PhotoStorageError("photo_storage_provider_unavailable");
  if (provider !== ref.provider) conflict("photo_storage_provider_mismatch");
  return ref;
}
function uploadDto(
  asset: UploadAsset,
  session: UploadSession,
  grant?: PhotoDirectUploadGrant,
) {
  const strategy = sessionStrategy(session);
  if (strategy === "multipart") {
    return {
      assetId: asset.id,
      sessionId: session.id,
      partSize: session.part_size,
      status: session.status,
      expiresAt: new Date(session.expires_at).toISOString(),
    };
  }
  if (!grant) conflict("photo_upload_not_active");
  const ref = recordedRef(asset, session);
  if (grant.provider !== ref.provider)
    conflict("photo_storage_provider_mismatch");
  return {
    assetId: asset.id,
    sessionId: session.id,
    strategy: "single-put" as const,
    uploadUrl: grant.url,
    requiredHeaders: safeRequiredHeaders(grant.requiredHeaders),
    status: session.status,
    expiresAt: grant.expiresAt,
  };
}
function completedUploadDto(asset: UploadAsset, session: UploadSession) {
  if (session.status !== "completed" || !isCompletedAsset(asset))
    conflict("photo_upload_not_active");
  return {
    assetId: asset.id,
    sessionId: session.id,
    strategy: sessionStrategy(session),
    status: "completed" as const,
    expiresAt: new Date(session.expires_at).toISOString(),
  };
}
function assertWritableSession(
  asset: UploadAsset,
  session: UploadSession,
): void {
  if (session.status !== "active" || asset.status !== "uploading")
    conflict("photo_upload_not_active");
  if (!sessionUsable(session)) conflict("photo_upload_expired");
}
async function issueExistingUploadDto(
  operations: UploadOperations,
  asset: UploadAsset,
  session: UploadSession,
) {
  if (session.status === "completed")
    return completedUploadDto(asset, session);
  assertWritableSession(asset, session);
  if (sessionStrategy(session) === "multipart") return uploadDto(asset, session);
  const ref = recordedRef(asset, session);
  const contentType = asset.detected_mime_type;
  if (!contentType) conflict("photo_upload_not_active");
  const grant = await operations.storage.createDirectUpload({
    provider: ref.provider,
    key: ref.key,
    contentType,
    maxBytes: asset.expected_bytes,
    expiresIn: SIGNATURE_SECONDS,
  });
  return uploadDto(asset, session, grant);
}
function sessionUsable(session: UploadSession) {
  return (
    session.status === "active" &&
    new Date(session.expires_at).getTime() > Date.now()
  );
}
function parseSignature(value: unknown): Buffer {
  if (
    typeof value !== "string" ||
    value.length > 256 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    invalid("photo_file_unsupported");
  return Buffer.from(value, "base64");
}
function parseParts(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10000)
    invalid("photo_upload_invalid_parts");
  return value.map((part, index) => {
    if (!part || typeof part !== "object")
      invalid("photo_upload_invalid_parts");
    const p = part as Record<string, unknown>;
    if (
      p.partNumber !== index + 1 ||
      typeof p.etag !== "string" ||
      !p.etag ||
      typeof p.checksumCRC32C !== "string"
    )
      invalid("photo_upload_invalid_parts");
    return {
      partNumber: p.partNumber as number,
      etag: p.etag,
      checksumCRC32C: p.checksumCRC32C,
    };
  });
}
function parseEtag(value: Record<string, unknown>): string {
  const keys = Object.keys(value);
  if (
    keys.length !== 1 ||
    keys[0] !== "etag" ||
    typeof value.etag !== "string" ||
    !value.etag.trim()
  )
    invalid("photo_upload_invalid_input");
  return value.etag;
}
function storedEtag(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const etag = (value as Record<string, unknown>).etag;
  return typeof etag === "string" && etag ? etag : null;
}
function sameParts(value: unknown, parts: CompletedPart[]): boolean {
  if (!Array.isArray(value) || value.length !== parts.length) return false;
  return value.every((item, index) => {
    if (!item || typeof item !== "object") return false;
    const part = item as Record<string, unknown>;
    return (
      part.partNumber === parts[index].partNumber &&
      part.etag === parts[index].etag &&
      part.checksumCRC32C === parts[index].checksumCRC32C
    );
  });
}
function sameCompletion(
  session: UploadSession,
  result: CompletionResult,
): boolean {
  return sessionStrategy(session) === "single-put"
    ? storedEtag(session.completion_metadata) === result.etag
    : sameParts(session.completed_parts, result.parts ?? []);
}
function isCompletedAsset(asset: UploadAsset): boolean {
  return ["uploaded", "processing", "ready", "blocked", "failed"].includes(
    asset.status,
  );
}
function assertTransition(run: () => void): void {
  try {
    run();
  } catch {
    transitionConflict();
  }
}
function storageMissing(error: unknown): boolean {
  return (
    error instanceof PhotoStorageError &&
    error.code === "photo_storage_not_found"
  );
}
function firstUpdated<T>(result: T | T[] | null | undefined): T | null {
  return Array.isArray(result) ? (result[0] ?? null) : (result ?? null);
}

export async function handleCreateUpload(
  req: Request,
  res: Response,
  operations: UploadOperations,
): Promise<void> {
  const jobId = param(req, "id");
  const job = await operations.assertOwnedJob(req, jobId);
  if (job.status === "cancelled" || job.status === "expired")
    transitionConflict();
  const input = body(req.body);
  if (
    typeof input.filename !== "string" ||
    typeof input.reportedMime !== "string" ||
    typeof input.bytes !== "number" ||
    typeof input.sourceIdempotencyKey !== "string" ||
    !input.sourceIdempotencyKey.trim()
  )
    invalid("photo_upload_invalid_input");
  let valid;
  try {
    valid = validatePhotoFile({
      filename: input.filename,
      reportedMime: input.reportedMime,
      bytes: input.bytes,
      signature: parseSignature(input.signatureBase64),
    });
  } catch (caught) {
    invalid(
      caught instanceof Error && caught.message.startsWith("photo_")
        ? caught.message
        : "photo_file_unsupported",
    );
  }
  const key = input.sourceIdempotencyKey.trim();
  const existing = await operations.findSessionByIdempotencyKey(jobId, key);
  if (existing) {
    res.json({
      upload: await issueExistingUploadDto(
        operations,
        existing.asset,
        existing.session,
      ),
    });
    return;
  }

  const objectKey = `photo-jobs/${randomUUID()}/originals/${randomUUID()}`;
  const provider = operations.storage.defaultProvider;
  const grant = await operations.storage.createDirectUpload({
    provider,
    key: objectKey,
    contentType: valid.detectedMime,
    maxBytes: input.bytes,
    expiresIn: SIGNATURE_SECONDS,
  });
  const grantedRef = { provider: grant.provider, key: objectKey };
  if (grant.provider !== provider) {
    await operations.storage.delete([grantedRef]);
    conflict("photo_storage_provider_mismatch");
  }

  const created = await operations.createAssetAndSession({
    jobId,
    displayName: valid.displayName,
    objectKey,
    reportedMime: input.reportedMime,
    detectedMime: valid.detectedMime,
    expectedBytes: input.bytes,
    idempotencyKey: key,
    provider: grant.provider,
    uploadStrategy: "single-put",
    providerUploadId: null,
    partSize: input.bytes,
    completionMetadata: null,
    expiresAt: new Date(grant.expiresAt),
  });

  if (!created.created) {
    const winnerRef = recordedRef(created.asset, created.session);
    if (sameRef(winnerRef, grantedRef)) {
      assertWritableSession(created.asset, created.session);
      res.json({
        upload: uploadDto(created.asset, created.session, grant),
      });
      return;
    }
    await operations.storage.delete([grantedRef]);
    res.json({
      upload: await issueExistingUploadDto(
        operations,
        created.asset,
        created.session,
      ),
    });
    return;
  }
  res.json({ upload: uploadDto(created.asset, created.session, grant) });
}

export async function handleSignPart(
  req: Request,
  res: Response,
  operations: UploadOperations,
): Promise<void> {
  const found = await operations.findOwnedSession(
    req,
    param(req, "id"),
    param(req, "sessionId"),
  );
  const ref = recordedRef(found.asset, found.session);
  if (
    sessionStrategy(found.session) !== "multipart" ||
    ref.provider !== "s3" ||
    found.session.status !== "active"
  )
    conflict("photo_upload_not_active");
  if (!sessionUsable(found.session)) conflict("photo_upload_expired");
  const input = body(req.body);
  const partNumber = input.partNumber;
  if (
    !Number.isInteger(partNumber) ||
    (partNumber as number) < 1 ||
    (partNumber as number) > 10000 ||
    typeof input.checksumCRC32C !== "string"
  )
    invalid("photo_upload_invalid_part");
  const signed = await operations.storage.signLegacyPart({
    provider: "s3",
    key: ref.key,
    uploadId:
      found.session.provider_upload_id || conflict("photo_upload_not_active"),
    partNumber: partNumber as number,
    checksumCRC32C: input.checksumCRC32C,
    expiresIn: SIGNATURE_SECONDS,
  });
  res.json({ part: signed });
}

async function inspectStoredObject(
  operations: UploadOperations,
  asset: UploadAsset,
  ref: PhotoObjectRef,
  expectedEtag?: string,
) {
  const head = await operations.storage.inspect(ref);
  if (head.bytes !== asset.expected_bytes)
    conflict("photo_upload_size_mismatch");
  if (expectedEtag !== undefined && head.etag !== expectedEtag)
    conflict("photo_upload_completion_mismatch");
  const prefix = await operations.storage.readPrefix(
    ref,
    SIGNATURE_PREFIX_BYTES,
  );
  let actual;
  try {
    actual = validatePhotoFile({
      filename: asset.display_name,
      reportedMime: asset.reported_mime_type || "",
      bytes: head.bytes,
      signature: prefix,
    });
  } catch {
    conflict("photo_upload_metadata_mismatch");
  }
  if (
    head.contentType !== asset.detected_mime_type ||
    actual.detectedMime !== asset.detected_mime_type
  )
    conflict("photo_upload_metadata_mismatch");
  return head;
}

export async function handleComplete(
  req: Request,
  res: Response,
  operations: UploadOperations,
): Promise<void> {
  let found = await operations.findOwnedSession(
    req,
    param(req, "id"),
    param(req, "sessionId"),
  );
  const strategy = sessionStrategy(found.session);
  const ref = recordedRef(found.asset, found.session);
  const input = body(req.body);
  const etag = strategy === "single-put" ? parseEtag(input) : undefined;
  const parts = strategy === "multipart" ? parseParts(input.parts) : undefined;
  const requested: CompletionResult = {
    bytes: found.asset.expected_bytes,
    etag: etag ?? "",
    ...(parts ? { parts } : {}),
  };

  if (found.session.status === "completed") {
    if (!sameCompletion(found.session, requested))
      conflict("photo_upload_completion_mismatch");
    if (!isCompletedAsset(found.asset)) conflict("photo_upload_not_active");
    await operations.publishUploaded(found.asset);
    res.json({ asset: safeAsset(found.asset) });
    return;
  }
  if (found.session.status !== "active") conflict("photo_upload_not_active");

  if (strategy === "multipart") {
    if (ref.provider !== "s3") conflict("photo_upload_not_active");
    let objectExists = true;
    try {
      await operations.storage.inspect(ref);
    } catch (caught) {
      if (!storageMissing(caught)) throw caught;
      objectExists = false;
    }
    if (!objectExists) {
      if (!sessionUsable(found.session)) conflict("photo_upload_expired");
      await operations.storage.completeLegacyMultipart({
        provider: "s3",
        key: ref.key,
        uploadId:
          found.session.provider_upload_id ||
          conflict("photo_upload_not_active"),
        parts: parts ?? [],
      });
    }
  }

  let head;
  try {
    head = await inspectStoredObject(operations, found.asset, ref, etag);
  } catch (caught) {
    const invalidObject =
      caught instanceof MedusaError &&
      [
        "photo_upload_size_mismatch",
        "photo_upload_metadata_mismatch",
        "photo_upload_completion_mismatch",
      ].includes(caught.message);
    if (invalidObject) {
      const failure = await operations.failSession(
        found.asset,
        found.session,
        caught.message,
      );
      if (failure.claimed) {
        try {
          await operations.storage.delete([ref]);
        } catch {
          // The retryable failure state owns cleanup; keep the mismatch stable.
        }
      }
    }
    throw caught;
  }

  const result: CompletionResult = {
    bytes: head.bytes,
    etag: head.etag,
    ...(parts ? { parts } : {}),
  };
  try {
    const completedAsset = await operations.completeSession(
      found.asset,
      found.session,
      result,
    );
    await operations.publishUploaded(completedAsset);
    res.json({ asset: safeAsset(completedAsset) });
  } catch (caught) {
    found = await operations.findOwnedSession(
      req,
      param(req, "id"),
      param(req, "sessionId"),
    );
    if (found.session.status === "completed") {
      if (!sameCompletion(found.session, result))
        conflict("photo_upload_completion_mismatch");
      if (!isCompletedAsset(found.asset)) throw caught;
      await operations.publishUploaded(found.asset);
      res.json({ asset: safeAsset(found.asset) });
      return;
    }
    throw caught;
  }
}

export async function handleAbort(
  req: Request,
  res: Response,
  operations: UploadOperations,
): Promise<void> {
  const found = await operations.findOwnedSession(
    req,
    param(req, "id"),
    param(req, "sessionId"),
  );
  const strategy = sessionStrategy(found.session);
  const ref = recordedRef(found.asset, found.session);
  if (strategy === "multipart" && ref.provider !== "s3")
    conflict("photo_upload_not_active");
  if (found.session.status === "completed") conflict("photo_upload_not_active");
  const asset =
    found.session.status === "aborted"
      ? found.asset
      : await operations.abortSession(found.asset, found.session);
  try {
    if (strategy === "multipart" && found.session.provider_upload_id) {
      await operations.storage.abortLegacyMultipart({
        provider: "s3",
        key: ref.key,
        uploadId: found.session.provider_upload_id,
      });
    }
  } finally {
    await operations.storage.delete([ref]);
  }
  res.json({ asset: safeAsset(asset) });
}

function generatedNotFound(e: unknown) {
  return e instanceof Error && /not found|no .*found/i.test(e.message);
}
function isUploadTransitionConflict(error: unknown): boolean {
  return (
    error instanceof MedusaError && error.message === "photo_upload_not_active"
  );
}
function isSerializationFailure(e: unknown) {
  const error = e as { code?: string; message?: string }
  return error?.code === "40001" || error?.code === "40P01"
    || /could not serialize access|deadlock detected/i.test(error?.message ?? "")
}
export function createMedusaUploadOperations(req: Request): UploadOperations {
  const service: any = req.scope.resolve(PHOTO_PRODUCTION_MODULE);
  const storage: PhotoObjectStorage = req.scope.resolve(PHOTO_STORAGE_MODULE);
  async function retrieveJob(id: string, context?: any) {
    try {
      return await service.retrievePhotoJob(id, undefined, context);
    } catch (e) {
      if (generatedNotFound(e)) return null;
      throw e;
    }
  }
  async function listSession(id: string, context?: any) {
    const rows = await service.listPhotoUploadSessions({ id }, {}, context);
    return rows[0] ?? null;
  }
  async function retrieveAsset(id: string, context?: any) {
    try {
      return await service.retrievePhotoAsset(id, undefined, context);
    } catch (e) {
      if (generatedNotFound(e)) return null;
      throw e;
    }
  }
  async function findByKey(jobId: string, key: string, context?: any) {
    const rows = await service.listPhotoUploadSessions(
      { source_idempotency_key: `${jobId}:${key}` },
      {},
      context,
    );
    const session = rows[0];
    if (!session) return null;
    const asset = await retrieveAsset(session.asset_id, context);
    return asset?.job_id === jobId ? { asset, session } : null;
  }
  async function ownedJob(request: Request, id: string) {
    const job = await retrieveJob(id);
    if (!job) notFound();
    const customer = request.auth_context?.actor_id?.trim();
    const guest = header(request, "x-fotomax-guest-token")?.trim();
    if (
      job.status === "expired" ||
      (customer
        ? job.customer_id !== customer
        : !guest ||
          !job.guest_owner_hash ||
          !verifyGuestSecret(guest, job.guest_owner_hash))
    )
      notFound();
    return job;
  }
  async function mutateTerminal(
    asset: UploadAsset,
    session: UploadSession,
    target: "completed" | "aborted",
    completion?: CompletionResult,
    failureCode?: string,
  ) {
    const originalRef = recordedRef(asset, session);
    try {
      return await service.withPhotoJobTransaction(
        async (context: any) => {
          const latestSession = await listSession(session.id, context);
          const latestAsset = await retrieveAsset(asset.id, context);
          if (!latestSession || !latestAsset) notFound();
          const latestRef = recordedRef(latestAsset, latestSession);
          if (
            latestRef.provider !== originalRef.provider ||
            latestRef.key !== originalRef.key
          )
            conflict("photo_storage_provider_mismatch");
          if (target === "completed" && latestSession.status === "completed") {
            if (!completion || !sameCompletion(latestSession, completion))
              conflict("photo_upload_completion_mismatch");
            if (!isCompletedAsset(latestAsset)) transitionConflict();
            return latestAsset;
          }
          if (target === "aborted" && latestSession.status === "aborted")
            return latestAsset;
          assertTransition(() =>
            assertUploadSessionTransition(
              latestSession.status as PhotoUploadSessionStatus,
              target,
            ),
          );
          const assetTarget = target === "completed" ? "uploaded" : "failed";
          assertTransition(() =>
            assertPhotoAssetTransition(
              latestAsset.status as PhotoAssetStatus,
              assetTarget,
            ),
          );
          const strategy = sessionStrategy(latestSession);
          let sessionData;
          let assetData;
          if (target === "completed") {
            const completed =
              completion || conflict("photo_upload_completion_mismatch");
            sessionData = {
              status: target,
              completed_at: new Date(),
              ...(strategy === "single-put"
                ? { completion_metadata: { etag: completed.etag } }
                : { completed_parts: completed.parts ?? [] }),
            };
            assetData = {
              status: assetTarget,
              stored_bytes: completed.bytes,
              provider_etag: completed.etag,
              uploaded_at: new Date(),
              failure_code: null,
            };
          } else {
            sessionData = { status: target, aborted_at: new Date() };
            assetData = {
              status: assetTarget,
              failure_code: failureCode || "retry",
              failed_at: new Date(),
            };
          }
          const updatedSession = firstUpdated(
            await service.updatePhotoUploadSessions(
              {
                selector: { id: session.id, status: "active" },
                data: sessionData,
              },
              context,
            ),
          );
          if (!updatedSession) transitionConflict();
          const updatedAsset = firstUpdated(
            await service.updatePhotoAssets(
              {
                selector: { id: asset.id, status: "uploading" },
                data: assetData,
              },
              context,
            ),
          );
          if (!updatedAsset) transitionConflict();
          return updatedAsset;
        },
        { isolationLevel: "serializable" },
      );
    } catch (caught) {
      if (isSerializationFailure(caught)) transitionConflict();
      throw caught;
    }
  }
  return {
    storage,
    assertOwnedJob: ownedJob,
    findSessionByIdempotencyKey: findByKey,
    async createAssetAndSession(input) {
      try {
        return await service.withPhotoJobTransaction(
          async (context: any) => {
            const existing = await findByKey(
              input.jobId,
              input.idempotencyKey,
              context,
            );
            if (existing) return { ...existing, created: false };
            const job = await retrieveJob(input.jobId, context);
            if (!job) notFound();
            if (job.status !== "uploading")
              assertTransition(() =>
                assertPhotoJobTransition(
                  job.status as PhotoJobStatus,
                  "uploading",
                ),
              );
            const assets = await service.listPhotoAssets(
              { job_id: input.jobId },
              {},
              context,
            );
            const activeAssets = assets.filter(
              (item: any) => item.status !== "deleted",
            );
            if (activeAssets.length >= MAX_ASSETS)
              conflict("photo_asset_limit_exceeded");
            if (
              activeAssets.reduce(
                (sum: number, item: any) => sum + item.expected_bytes,
                0,
              ) +
                input.expectedBytes >
              MAX_JOB_BYTES
            )
              conflict("photo_job_bytes_exceeded");
            const asset = await service.createPhotoAssets(
              {
                job_id: input.jobId,
                display_name: input.displayName,
                object_key: input.objectKey,
                reported_mime_type: input.reportedMime,
                detected_mime_type: input.detectedMime,
                expected_bytes: input.expectedBytes,
                storage_provider: input.provider,
                status: "uploading",
                upload_started_at: new Date(),
              },
              context,
            );
            const session = await service.createPhotoUploadSessions(
              {
                asset_id: asset.id,
                source_idempotency_key: `${input.jobId}:${input.idempotencyKey}`,
                storage_provider: input.provider,
                upload_strategy: input.uploadStrategy,
                provider_upload_id: input.providerUploadId,
                part_size: input.partSize,
                expected_bytes: input.expectedBytes,
                completion_metadata: input.completionMetadata,
                status: "active",
                expires_at: input.expiresAt,
              },
              context,
            );
            if (job.status !== "uploading") {
              const updated = firstUpdated(
                await service.updatePhotoJobs(
                  {
                    selector: { id: input.jobId, status: job.status },
                    data: {
                      status: "uploading",
                      upload_started_at: new Date(),
                      last_activity_at: new Date(),
                    },
                  },
                  context,
                ),
              );
              if (!updated) transitionConflict();
            }
            return { asset, session, created: true };
          },
          { isolationLevel: "serializable" },
        );
      } catch (caught) {
        const winner = await findByKey(input.jobId, input.idempotencyKey);
        if (winner) return { ...winner, created: false };
        if (isSerializationFailure(caught)) conflict("photo_upload_conflict");
        throw caught;
      }
    },
    async findOwnedSession(request, jobId, sessionId) {
      await ownedJob(request, jobId);
      const session = await listSession(sessionId);
      if (!session) notFound();
      const asset = await retrieveAsset(session.asset_id);
      if (!asset || asset.job_id !== jobId) notFound();
      return { asset, session };
    },
    async completeSession(asset, session, result) {
      recordedRef(asset, session);
      return mutateTerminal(asset, session, "completed", result);
    },
    async publishUploaded(asset) {
      await req.scope.resolve("event_bus").emit({
        name: "photo_asset.uploaded",
        data: { asset_id: asset.id },
      });
    },
    async abortSession(asset, session) {
      return mutateTerminal(asset, session, "aborted", undefined, "retry");
    },
    async failSession(asset, session, code) {
      const originalRef = recordedRef(asset, session);
      try {
        const failed = await mutateTerminal(
          asset,
          session,
          "aborted",
          undefined,
          code.slice(0, 120),
        );
        return { asset: failed, claimed: true };
      } catch (caught) {
        if (!isUploadTransitionConflict(caught)) throw caught;
        const latestSession = await listSession(session.id);
        const latestAsset = await retrieveAsset(asset.id);
        if (!latestSession || !latestAsset) throw caught;
        const latestRef = recordedRef(latestAsset, latestSession);
        if (!sameRef(originalRef, latestRef))
          conflict("photo_storage_provider_mismatch");
        if (
          latestSession.status === "completed" &&
          isCompletedAsset(latestAsset)
        )
          return { asset: latestAsset, claimed: false };
        if (
          latestSession.status === "aborted" &&
          latestAsset.status === "failed"
        )
          return { asset: latestAsset, claimed: false };
        throw caught;
      }
    },
  };
}
