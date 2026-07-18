import { randomUUID } from "node:crypto"
import { MedusaError } from "@medusajs/framework/utils"
import { PHOTO_PRODUCTION_MODULE } from "../../../../../modules/photo-production"
import { validatePhotoFile } from "../../../../../modules/photo-production/file-validation"
import { verifyGuestSecret } from "../../../../../modules/photo-production/ownership"
import {
  assertPhotoAssetTransition,
  assertPhotoJobTransition,
  assertUploadSessionTransition,
  type PhotoAssetStatus,
  type PhotoJobStatus,
  type PhotoUploadSessionStatus,
} from "../../../../../modules/photo-production/state-machine"
import { PHOTO_STORAGE_MODULE } from "../../../../../modules/photo-storage"
import { PhotoStorageError, type PhotoObjectStorage } from "../../../../../modules/photo-storage/types"

const PART_SIZE = 8 * 1024 * 1024
const MAX_ASSETS = 500
const MAX_JOB_BYTES = 10 * 1024 ** 3
const SIGNATURE_SECONDS = 900
const SIGNATURE_PREFIX_BYTES = 12

type Headers = { get(name: string): string | null } | Record<string, string | string[] | undefined>
type Request = { body?: unknown; params?: Record<string, string | undefined>; headers: Headers; auth_context?: { actor_id?: string | null }; scope?: any }
type Response = { json(body: unknown): unknown }
export type UploadAsset = { id: string; job_id: string; display_name: string; object_key: string; expected_bytes: number; reported_mime_type?: string | null; detected_mime_type?: string | null; status: string; [key: string]: unknown }
export type UploadSession = { id: string; asset_id: string; source_idempotency_key: string; provider_upload_id?: string | null; part_size: number; expected_bytes: number; status: string; expires_at: Date | string; [key: string]: unknown }

type CreateInput = { jobId: string; displayName: string; objectKey: string; reportedMime: string; detectedMime: string; expectedBytes: number; idempotencyKey: string; providerUploadId: string; expiresAt: Date }

export interface UploadOperations {
  assertOwnedJob(req: Request, jobId: string): Promise<{ id: string; status: string }>
  findSessionByIdempotencyKey(jobId: string, key: string): Promise<{ asset: UploadAsset; session: UploadSession } | null>
  createAssetAndSession(input: CreateInput): Promise<{ asset: UploadAsset; session: UploadSession; created: boolean }>
  findOwnedSession(req: Request, jobId: string, sessionId: string): Promise<{ asset: UploadAsset; session: UploadSession }>
  completeSession(asset: UploadAsset, session: UploadSession, result: { bytes: number; checksumCRC32C: string }): Promise<UploadAsset>
  abortSession(asset: UploadAsset, session: UploadSession): Promise<UploadAsset>
  failSession(asset: UploadAsset, session: UploadSession, code: string): Promise<UploadAsset>
  storage: PhotoObjectStorage
}

function error(type: string, code: string): MedusaError { return new MedusaError(type, code) }
function invalid(code: string): never { throw error(MedusaError.Types.INVALID_DATA, code) }
function conflict(code: string): never { throw error(MedusaError.Types.CONFLICT, code) }
function notFound(): never { throw error(MedusaError.Types.NOT_FOUND, "photo_job_not_found") }
function transitionConflict(): never { return conflict("photo_upload_not_active") }
function body(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) invalid("photo_upload_invalid_input"); return value as Record<string, unknown> }
function param(req: Request, name: string): string { const value = req.params?.[name]?.trim(); if (!value) notFound(); return value }
function header(req: Request, name: string): string | null {
  if ("get" in req.headers && typeof req.headers.get === "function") return req.headers.get(name)
  const value = (req.headers as Record<string, string | string[] | undefined>)[name]
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}
function safeAsset(asset: UploadAsset) { const { object_key: _key, job_id: _job, ...safe } = asset; return safe }
function uploadDto(asset: UploadAsset, session: UploadSession) { return { assetId: asset.id, sessionId: session.id, partSize: session.part_size, status: session.status, expiresAt: new Date(session.expires_at).toISOString() } }
function sessionUsable(session: UploadSession) { return session.status === "active" && new Date(session.expires_at).getTime() > Date.now() }
function parseSignature(value: unknown): Buffer { if (typeof value !== "string" || value.length > 256 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) invalid("photo_file_unsupported"); return Buffer.from(value, "base64") }
function parseParts(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10000) invalid("photo_upload_invalid_parts")
  return value.map((part, index) => {
    if (!part || typeof part !== "object") invalid("photo_upload_invalid_parts")
    const p = part as Record<string, unknown>
    if (p.partNumber !== index + 1 || typeof p.etag !== "string" || !p.etag || typeof p.checksumCRC32C !== "string") invalid("photo_upload_invalid_parts")
    return { partNumber: p.partNumber as number, etag: p.etag, checksumCRC32C: p.checksumCRC32C }
  })
}
function assertTransition(run: () => void): void { try { run() } catch { transitionConflict() } }
function storageMissing(error: unknown): boolean { return error instanceof PhotoStorageError && error.code === "photo_storage_not_found" }
function firstUpdated<T>(result: T | T[] | null | undefined): T | null {
  return Array.isArray(result) ? result[0] ?? null : result ?? null
}

export async function handleCreateUpload(req: Request, res: Response, operations: UploadOperations): Promise<void> {
  const jobId = param(req, "id")
  const job = await operations.assertOwnedJob(req, jobId)
  if (job.status === "cancelled" || job.status === "expired") transitionConflict()
  const input = body(req.body)
  if (typeof input.filename !== "string" || typeof input.reportedMime !== "string" || typeof input.bytes !== "number" || typeof input.sourceIdempotencyKey !== "string" || !input.sourceIdempotencyKey.trim()) invalid("photo_upload_invalid_input")
  const valid = validatePhotoFile({ filename: input.filename, reportedMime: input.reportedMime, bytes: input.bytes, signature: parseSignature(input.signatureBase64) })
  const key = input.sourceIdempotencyKey.trim()
  const existing = await operations.findSessionByIdempotencyKey(jobId, key)
  if (existing) { res.json({ upload: uploadDto(existing.asset, existing.session) }); return }

  const objectKey = `photo-jobs/${randomUUID()}/originals/${randomUUID()}`
  const started = await operations.storage.startMultipartUpload({ key: objectKey, contentType: valid.detectedMime })
  try {
    const created = await operations.createAssetAndSession({ jobId, displayName: valid.displayName, objectKey, reportedMime: input.reportedMime, detectedMime: valid.detectedMime, expectedBytes: input.bytes, idempotencyKey: key, providerUploadId: started.uploadId, expiresAt: new Date(Date.now() + SIGNATURE_SECONDS * 1000) })
    if (!created.created) await operations.storage.abortMultipartUpload({ key: objectKey, uploadId: started.uploadId })
    res.json({ upload: uploadDto(created.asset, created.session) })
  } catch (caught) {
    await operations.storage.abortMultipartUpload({ key: objectKey, uploadId: started.uploadId })
    throw caught
  }
}

export async function handleSignPart(req: Request, res: Response, operations: UploadOperations): Promise<void> {
  const found = await operations.findOwnedSession(req, param(req, "id"), param(req, "sessionId"))
  if (found.session.status !== "active") conflict("photo_upload_not_active")
  if (!sessionUsable(found.session)) conflict("photo_upload_expired")
  const input = body(req.body); const partNumber = input.partNumber
  if (!Number.isInteger(partNumber) || (partNumber as number) < 1 || (partNumber as number) > 10000 || typeof input.checksumCRC32C !== "string") invalid("photo_upload_invalid_part")
  const signed = await operations.storage.signUploadPart({ key: found.asset.object_key, uploadId: found.session.provider_upload_id || conflict("photo_upload_not_active"), partNumber: partNumber as number, checksumCRC32C: input.checksumCRC32C, expiresIn: SIGNATURE_SECONDS })
  res.json({ part: signed })
}

async function inspectStoredObject(operations: UploadOperations, asset: UploadAsset) {
  const [head, prefix] = await Promise.all([
    operations.storage.headPrivateObject(asset.object_key),
    operations.storage.readPrivateObjectPrefix(asset.object_key, SIGNATURE_PREFIX_BYTES),
  ])
  if (head.bytes !== asset.expected_bytes) conflict("photo_upload_size_mismatch")
  let actual
  try {
    actual = validatePhotoFile({ filename: asset.display_name, reportedMime: asset.reported_mime_type || "", bytes: head.bytes, signature: prefix })
  } catch {
    conflict("photo_upload_metadata_mismatch")
  }
  if (head.contentType !== asset.detected_mime_type || actual.detectedMime !== asset.detected_mime_type) conflict("photo_upload_metadata_mismatch")
  return head
}

export async function handleComplete(req: Request, res: Response, operations: UploadOperations): Promise<void> {
  let found = await operations.findOwnedSession(req, param(req, "id"), param(req, "sessionId"))
  if (found.session.status === "completed" && found.asset.status === "uploaded") { res.json({ asset: safeAsset(found.asset) }); return }
  if (found.session.status !== "active") conflict("photo_upload_not_active")
  const parts = parseParts(body(req.body).parts)

  let objectExists = true
  try { await operations.storage.headPrivateObject(found.asset.object_key) } catch (caught) {
    if (!storageMissing(caught)) throw caught
    objectExists = false
  }
  if (!objectExists) {
    if (!sessionUsable(found.session)) conflict("photo_upload_expired")
    await operations.storage.completeMultipartUpload({ key: found.asset.object_key, uploadId: found.session.provider_upload_id || conflict("photo_upload_not_active"), parts })
  }

  let head
  try {
    head = await inspectStoredObject(operations, found.asset)
  } catch (caught) {
    const invalidObject = caught instanceof MedusaError &&
      ["photo_upload_size_mismatch", "photo_upload_metadata_mismatch"].includes(caught.message)
    if (invalidObject) {
      await operations.storage.deletePrivateObjects([found.asset.object_key])
      await operations.failSession(found.asset, found.session, caught.message)
    }
    throw caught
  }

  try {
    const asset = await operations.completeSession(found.asset, found.session, { bytes: head.bytes, checksumCRC32C: head.checksumCRC32C })
    res.json({ asset: safeAsset(asset) })
  } catch (caught) {
    found = await operations.findOwnedSession(req, param(req, "id"), param(req, "sessionId"))
    if (found.session.status === "completed" && found.asset.status === "uploaded") { res.json({ asset: safeAsset(found.asset) }); return }
    throw caught
  }
}

export async function handleAbort(req: Request, res: Response, operations: UploadOperations): Promise<void> {
  const found = await operations.findOwnedSession(req, param(req, "id"), param(req, "sessionId"))
  if (found.session.status === "completed") conflict("photo_upload_not_active")
  const asset = found.session.status === "aborted"
    ? found.asset
    : await operations.abortSession(found.asset, found.session)
  try {
    if (found.session.provider_upload_id) {
      await operations.storage.abortMultipartUpload({ key: found.asset.object_key, uploadId: found.session.provider_upload_id })
    }
  } finally {
    await operations.storage.deletePrivateObjects([found.asset.object_key])
  }
  res.json({ asset: safeAsset(asset) })
}

function generatedNotFound(e: unknown) { return e instanceof Error && /not found|no .*found/i.test(e.message) }
function isSerializationFailure(e: unknown) { return e instanceof Error && /serializ|could not serialize|deadlock/i.test(e.message) }
export function createMedusaUploadOperations(req: Request): UploadOperations {
  const service: any = req.scope.resolve(PHOTO_PRODUCTION_MODULE)
  const storage: PhotoObjectStorage = req.scope.resolve(PHOTO_STORAGE_MODULE)
  async function retrieveJob(id: string, context?: any) { try { return await service.retrievePhotoJob(id, undefined, context) } catch (e) { if (generatedNotFound(e)) return null; throw e } }
  async function listSession(id: string, context?: any) { const rows = await service.listPhotoUploadSessions({ id }, {}, context); return rows[0] ?? null }
  async function retrieveAsset(id: string, context?: any) { try { return await service.retrievePhotoAsset(id, undefined, context) } catch (e) { if (generatedNotFound(e)) return null; throw e } }
  async function findByKey(jobId: string, key: string, context?: any) {
    const rows = await service.listPhotoUploadSessions({ source_idempotency_key: key }, {}, context)
    const session = rows[0]
    if (!session) return null
    const asset = await retrieveAsset(session.asset_id, context)
    return asset?.job_id === jobId ? { asset, session } : null
  }
  async function ownedJob(request: Request, id: string) {
    const job = await retrieveJob(id)
    if (!job) notFound()
    const customer = request.auth_context?.actor_id?.trim(); const guest = header(request, "x-fotomax-guest-token")?.trim()
    if (job.status === "expired" || (customer ? job.customer_id !== customer : !guest || !job.guest_owner_hash || !verifyGuestSecret(guest, job.guest_owner_hash))) notFound()
    return job
  }
  async function mutateTerminal(asset: UploadAsset, session: UploadSession, target: "completed" | "aborted", code?: string) {
    try {
      return await service.withPhotoJobTransaction(async (context: any) => {
        const latestSession = await listSession(session.id, context)
        const latestAsset = await retrieveAsset(asset.id, context)
        if (!latestSession || !latestAsset) notFound()
        if (target === "completed" && latestSession.status === "completed" && latestAsset.status === "uploaded") return latestAsset
        if (target === "aborted" && latestSession.status === "aborted") return latestAsset
        assertTransition(() => assertUploadSessionTransition(latestSession.status as PhotoUploadSessionStatus, target))
        const assetTarget = target === "completed" ? "uploaded" : "failed"
        assertTransition(() => assertPhotoAssetTransition(latestAsset.status as PhotoAssetStatus, assetTarget))
        const updatedSession = firstUpdated(await service.updatePhotoUploadSessions({ selector: { id: session.id, status: "active" }, data: target === "completed" ? { status: target, completed_at: new Date() } : { status: target, aborted_at: new Date() } }, context))
        if (!updatedSession) transitionConflict()
        const updatedAsset = firstUpdated(await service.updatePhotoAssets({ selector: { id: asset.id, status: "uploading" }, data: target === "completed" ? { status: assetTarget, stored_bytes: asset.expected_bytes, crc32c: code, uploaded_at: new Date(), failure_code: null } : { status: assetTarget, failure_code: code || "retry", failed_at: new Date() } }, context))
        if (!updatedAsset) transitionConflict()
        return updatedAsset
      }, { isolationLevel: "SERIALIZABLE" })
    } catch (caught) {
      if (isSerializationFailure(caught)) transitionConflict()
      throw caught
    }
  }
  return {
    storage,
    assertOwnedJob: ownedJob,
    findSessionByIdempotencyKey: findByKey,
    async createAssetAndSession(input) {
      try {
        return await service.withPhotoJobTransaction(async (context: any) => {
          const existing = await findByKey(input.jobId, input.idempotencyKey, context)
          if (existing) return { ...existing, created: false }
          const job = await retrieveJob(input.jobId, context)
          if (!job) notFound()
          if (job.status !== "uploading") assertTransition(() => assertPhotoJobTransition(job.status as PhotoJobStatus, "uploading"))
          const assets = await service.listPhotoAssets({ job_id: input.jobId }, {}, context)
          const activeAssets = assets.filter((item: any) => item.status !== "deleted")
          if (activeAssets.length >= MAX_ASSETS) conflict("photo_asset_limit_exceeded")
          if (activeAssets.reduce((sum: number, item: any) => sum + item.expected_bytes, 0) + input.expectedBytes > MAX_JOB_BYTES) conflict("photo_job_bytes_exceeded")
          const asset = await service.createPhotoAssets({ job_id: input.jobId, display_name: input.displayName, object_key: input.objectKey, reported_mime_type: input.reportedMime, detected_mime_type: input.detectedMime, expected_bytes: input.expectedBytes, status: "uploading", upload_started_at: new Date() }, context)
          const session = await service.createPhotoUploadSessions({ asset_id: asset.id, source_idempotency_key: input.idempotencyKey, provider_upload_id: input.providerUploadId, part_size: PART_SIZE, expected_bytes: input.expectedBytes, status: "active", expires_at: input.expiresAt }, context)
          if (job.status !== "uploading") {
            const updated = firstUpdated(await service.updatePhotoJobs({ selector: { id: input.jobId, status: job.status }, data: { status: "uploading", upload_started_at: new Date(), last_activity_at: new Date() } }, context))
            if (!updated) transitionConflict()
          }
          return { asset, session, created: true }
        }, { isolationLevel: "SERIALIZABLE" })
      } catch (caught) {
        const winner = await findByKey(input.jobId, input.idempotencyKey)
        if (winner) return { ...winner, created: false }
        if (isSerializationFailure(caught)) conflict("photo_upload_conflict")
        throw caught
      }
    },
    async findOwnedSession(request, jobId, sessionId) { await ownedJob(request, jobId); const session = await listSession(sessionId); if (!session) notFound(); const asset = await retrieveAsset(session.asset_id); if (!asset || asset.job_id !== jobId) notFound(); return { asset, session } },
    async completeSession(asset, session, result) { return mutateTerminal({ ...asset, expected_bytes: result.bytes }, session, "completed", result.checksumCRC32C) },
    async abortSession(asset, session) { return mutateTerminal(asset, session, "aborted", "retry") },
    async failSession(asset, session, code) { return mutateTerminal(asset, session, "aborted", code.slice(0, 120)) },
  }
}
