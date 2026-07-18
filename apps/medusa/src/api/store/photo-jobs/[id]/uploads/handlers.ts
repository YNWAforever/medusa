import { randomUUID } from "node:crypto"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { PHOTO_PRODUCTION_MODULE } from "../../../../../modules/photo-production"
import { verifyGuestSecret } from "../../../../../modules/photo-production/ownership"
import { validatePhotoFile } from "../../../../../modules/photo-production/file-validation"
import { PHOTO_STORAGE_MODULE } from "../../../../../modules/photo-storage"
import type { PhotoObjectStorage } from "../../../../../modules/photo-storage/types"

const PART_SIZE = 8 * 1024 * 1024
const MAX_ASSETS = 500
const MAX_JOB_BYTES = 10 * 1024 ** 3
const SIGNATURE_SECONDS = 900

type Headers = { get(name: string): string | null } | Record<string, string | string[] | undefined>
type Request = { body?: unknown; params?: Record<string, string | undefined>; headers: Headers; auth_context?: { actor_id?: string | null }; scope?: any }
type Response = { json(body: unknown): unknown }
export type UploadAsset = { id: string; job_id: string; object_key: string; expected_bytes: number; reported_mime_type?: string | null; detected_mime_type?: string | null; status: string; [key: string]: unknown }
export type UploadSession = { id: string; asset_id: string; source_idempotency_key: string; provider_upload_id?: string | null; part_size: number; expected_bytes: number; status: string; expires_at: Date | string; [key: string]: unknown }

export interface UploadOperations {
  assertOwnedJob(req: Request, jobId: string): Promise<{ id: string }>
  countAssets(jobId: string): Promise<number>
  sumExpectedBytes(jobId: string): Promise<number>
  findSessionByIdempotencyKey(jobId: string, key: string): Promise<{ asset: UploadAsset; session: UploadSession } | null>
  createAssetAndSession(input: { jobId: string; displayName: string; objectKey: string; reportedMime: string; detectedMime: string; expectedBytes: number; idempotencyKey: string; providerUploadId: string; expiresAt: Date }): Promise<{ asset: UploadAsset; session: UploadSession }>
  findOwnedSession(req: Request, jobId: string, sessionId: string): Promise<{ asset: UploadAsset; session: UploadSession }>
  completeSession(asset: UploadAsset, session: UploadSession, result: { bytes: number; checksumCRC32C: string }): Promise<UploadAsset>
  abortSession(asset: UploadAsset, session: UploadSession): Promise<UploadAsset>
  storage: PhotoObjectStorage
}

function error(type: string, code: string): MedusaError { return new MedusaError(type, code) }
function invalid(code: string): never { throw error(MedusaError.Types.INVALID_DATA, code) }
function conflict(code: string): never { throw error(MedusaError.Types.CONFLICT, code) }
function notFound(): never { throw error(MedusaError.Types.NOT_FOUND, "photo_job_not_found") }
function body(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) invalid("photo_upload_invalid_input"); return value as Record<string, unknown> }
function param(req: Request, name: string): string { const value = req.params?.[name]?.trim(); if (!value) notFound(); return value }
function header(req: Request, name: string): string | null {
  if ("get" in req.headers && typeof req.headers.get === "function") return req.headers.get(name)
  const value = (req.headers as Record<string, string | string[] | undefined>)[name]; return Array.isArray(value) ? value[0] ?? null : value ?? null
}
function safeAsset(asset: UploadAsset) { const { object_key: _key, job_id: _job, ...safe } = asset; return safe }
function uploadDto(asset: UploadAsset, session: UploadSession) { return { assetId: asset.id, sessionId: session.id, partSize: session.part_size, status: session.status, expiresAt: new Date(session.expires_at).toISOString() } }
function sessionUsable(session: UploadSession) { return session.status === "active" && new Date(session.expires_at).getTime() > Date.now() }
function parseSignature(value: unknown): Buffer { if (typeof value !== "string" || value.length > 256 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) invalid("photo_file_unsupported"); return Buffer.from(value, "base64") }
function parseParts(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10000) invalid("photo_upload_invalid_parts")
  const parts = value.map((part, index) => {
    if (!part || typeof part !== "object") invalid("photo_upload_invalid_parts")
    const p = part as Record<string, unknown>
    if (p.partNumber !== index + 1 || typeof p.etag !== "string" || !p.etag || typeof p.checksumCRC32C !== "string") invalid("photo_upload_invalid_parts")
    return { partNumber: p.partNumber as number, etag: p.etag, checksumCRC32C: p.checksumCRC32C }
  })
  return parts
}

export async function handleCreateUpload(req: Request, res: Response, operations: UploadOperations): Promise<void> {
  const jobId = param(req, "id"); await operations.assertOwnedJob(req, jobId)
  const input = body(req.body)
  if (typeof input.filename !== "string" || typeof input.reportedMime !== "string" || typeof input.bytes !== "number" || typeof input.sourceIdempotencyKey !== "string" || !input.sourceIdempotencyKey.trim()) invalid("photo_upload_invalid_input")
  const valid = validatePhotoFile({ filename: input.filename, reportedMime: input.reportedMime, bytes: input.bytes, signature: parseSignature(input.signatureBase64) })
  const key = input.sourceIdempotencyKey.trim()
  const existing = await operations.findSessionByIdempotencyKey(jobId, key)
  if (existing) { res.json({ upload: uploadDto(existing.asset, existing.session) }); return }
  if (await operations.countAssets(jobId) >= MAX_ASSETS) conflict("photo_asset_limit_exceeded")
  if (await operations.sumExpectedBytes(jobId) + input.bytes > MAX_JOB_BYTES) conflict("photo_job_bytes_exceeded")
  const objectKey = `photo-jobs/${randomUUID()}/originals/${randomUUID()}`
  const started = await operations.storage.startMultipartUpload({ key: objectKey, contentType: valid.detectedMime })
  const created = await operations.createAssetAndSession({ jobId, displayName: valid.displayName, objectKey, reportedMime: input.reportedMime, detectedMime: valid.detectedMime, expectedBytes: input.bytes, idempotencyKey: key, providerUploadId: started.uploadId, expiresAt: new Date(Date.now() + SIGNATURE_SECONDS * 1000) })
  res.json({ upload: uploadDto(created.asset, created.session) })
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

export async function handleComplete(req: Request, res: Response, operations: UploadOperations): Promise<void> {
  const found = await operations.findOwnedSession(req, param(req, "id"), param(req, "sessionId"))
  if (found.session.status === "completed" && found.asset.status === "uploaded") { res.json({ asset: safeAsset(found.asset) }); return }
  if (!sessionUsable(found.session)) conflict(found.session.status === "active" ? "photo_upload_expired" : "photo_upload_not_active")
  const parts = parseParts(body(req.body).parts)
  const completed = await operations.storage.completeMultipartUpload({ key: found.asset.object_key, uploadId: found.session.provider_upload_id || conflict("photo_upload_not_active"), parts })
  const head = await operations.storage.headPrivateObject(found.asset.object_key)
  if (head.bytes !== found.asset.expected_bytes) conflict("photo_upload_size_mismatch")
  if (head.checksumCRC32C !== completed.checksumCRC32C || head.contentType !== found.asset.detected_mime_type) conflict("photo_upload_metadata_mismatch")
  const asset = await operations.completeSession(found.asset, found.session, { bytes: head.bytes, checksumCRC32C: head.checksumCRC32C })
  res.json({ asset: safeAsset(asset) })
}

export async function handleAbort(req: Request, res: Response, operations: UploadOperations): Promise<void> {
  const found = await operations.findOwnedSession(req, param(req, "id"), param(req, "sessionId"))
  if (found.session.status === "aborted") { res.json({ asset: safeAsset(found.asset) }); return }
  if (found.session.status === "completed") conflict("photo_upload_not_active")
  if (found.session.provider_upload_id) await operations.storage.abortMultipartUpload({ key: found.asset.object_key, uploadId: found.session.provider_upload_id })
  res.json({ asset: safeAsset(await operations.abortSession(found.asset, found.session)) })
}

function generatedNotFound(e: unknown) { return e instanceof Error && /not found|no .*found/i.test(e.message) }
export function createMedusaUploadOperations(req: Request): UploadOperations {
  const service: any = req.scope.resolve(PHOTO_PRODUCTION_MODULE)
  const storage: PhotoObjectStorage = req.scope.resolve(PHOTO_STORAGE_MODULE)
  async function ownedJob(request: Request, id: string) {
    let job: any; try { job = await service.retrievePhotoJob(id) } catch (e) { if (generatedNotFound(e)) notFound(); throw e }
    const customer = request.auth_context?.actor_id?.trim(); const guest = header(request, "x-fotomax-guest-token")?.trim()
    if (job.status === "expired" || (customer ? job.customer_id !== customer : !guest || !job.guest_owner_hash || !verifyGuestSecret(guest, job.guest_owner_hash))) notFound()
    return job
  }
  async function listSession(id: string) { const rows = await service.listPhotoUploadSessions({ id }); return rows[0] ?? null }
  async function retrieveAsset(id: string) { try { return await service.retrievePhotoAsset(id) } catch (e) { if (generatedNotFound(e)) return null; throw e } }
  return {
    storage,
    assertOwnedJob: ownedJob,
    async countAssets(jobId) { const rows = await service.listPhotoAssets({ job_id: jobId }); return rows.filter((a: any) => a.status !== "deleted").length },
    async sumExpectedBytes(jobId) { const rows = await service.listPhotoAssets({ job_id: jobId }); return rows.filter((a: any) => a.status !== "deleted").reduce((sum: number, a: any) => sum + a.expected_bytes, 0) },
    async findSessionByIdempotencyKey(jobId, key) { const rows = await service.listPhotoUploadSessions({ source_idempotency_key: key }); const session = rows[0]; if (!session) return null; const asset = await retrieveAsset(session.asset_id); return asset?.job_id === jobId ? { asset, session } : null },
    async createAssetAndSession(input) {
      return service.withPhotoJobTransaction(async (context: any) => {
        const asset = await service.createPhotoAssets({ job_id: input.jobId, display_name: input.displayName, object_key: input.objectKey, reported_mime_type: input.reportedMime, detected_mime_type: input.detectedMime, expected_bytes: input.expectedBytes, status: "uploading", upload_started_at: new Date() }, context)
        const session = await service.createPhotoUploadSessions({ asset_id: asset.id, source_idempotency_key: input.idempotencyKey, provider_upload_id: input.providerUploadId, part_size: PART_SIZE, expected_bytes: input.expectedBytes, status: "active", expires_at: input.expiresAt }, context)
        await service.updatePhotoJobs({ selector: { id: input.jobId }, data: { status: "uploading", upload_started_at: new Date(), last_activity_at: new Date() } }, context)
        return { asset, session }
      }, { isolationLevel: "SERIALIZABLE" })
    },
    async findOwnedSession(request, jobId, sessionId) { await ownedJob(request, jobId); const session = await listSession(sessionId); if (!session) notFound(); const asset = await retrieveAsset(session.asset_id); if (!asset || asset.job_id !== jobId) notFound(); return { asset, session } },
    async completeSession(asset, session, result) {
      return service.withPhotoJobTransaction(async (context: any) => {
        const latest = await listSession(session.id); if (latest?.status === "completed") return retrieveAsset(asset.id)
        await service.updatePhotoUploadSessions({ selector: { id: session.id, status: "active" }, data: { status: "completed", completed_at: new Date() } }, context)
        return service.updatePhotoAssets({ selector: { id: asset.id, status: "uploading" }, data: { status: "uploaded", stored_bytes: result.bytes, crc32c: result.checksumCRC32C, uploaded_at: new Date(), failure_code: null } }, context)
      }, { isolationLevel: "SERIALIZABLE" })
    },
    async abortSession(asset, session) {
      return service.withPhotoJobTransaction(async (context: any) => {
        await service.updatePhotoUploadSessions({ selector: { id: session.id }, data: { status: "aborted", aborted_at: new Date() } }, context)
        if (asset.status === "deleted") return asset
        return service.updatePhotoAssets({ selector: { id: asset.id }, data: { status: "failed", failure_code: "retry", failed_at: new Date() } }, context)
      }, { isolationLevel: "SERIALIZABLE" })
    },
  }
}
