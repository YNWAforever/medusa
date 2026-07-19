import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

import {
  hashGuestSecret,
  resolvePhotoOwnerContext,
  verifyGuestSecret,
  type PhotoOwnerContext,
} from "../../../modules/photo-production/ownership"
import { PHOTO_PRODUCTION_MODULE } from "../../../modules/photo-production"
import PhotoProductionModuleService from "../../../modules/photo-production/service"
import {
  assertPhotoJobTransition,
  type PhotoJobStatus,
} from "../../../modules/photo-production/state-machine"

const PHOTO_PRODUCT_HANDLE = "classic-4r-photo-print"

export interface PhotoJobRecord {
  id: string
  guest_owner_hash?: string | null
  customer_id?: string | null
  region_id: string
  locale: string
  currency_code: string
  product_handle: string
  status: string
  revision: number
  active_version_id?: string | null
  retention_class: string
  last_activity_at: Date | string
  upload_started_at?: Date | string | null
  ready_at?: Date | string | null
  failed_at?: Date | string | null
  cancelled_at?: Date | string | null
  expired_at?: Date | string | null
  created_at?: Date | string
  updated_at?: Date | string
}

export interface PhotoJobOperations {
  createPhotoJob(input: Record<string, unknown>): Promise<PhotoJobRecord>
  listPhotoJobs(filters: Record<string, unknown>): Promise<PhotoJobRecord[]>
  retrievePhotoJob(id: string): Promise<PhotoJobRecord | null>
  listPhotoAssets(jobId: string): Promise<Array<Record<string, unknown>>>
  retrievePhotoJobVersion(id: string): Promise<Record<string, unknown> | null>
  listPrintItems(versionId: string): Promise<Array<Record<string, unknown>>>
  updatePhotoJob(
    selector: Record<string, unknown>,
    data: Record<string, unknown>,
  ): Promise<PhotoJobRecord | null>
  withTransaction<T>(
    callback: (operations: PhotoJobOperations) => Promise<T>,
  ): Promise<T>
  resolveHongKongPhotoProduct(): Promise<{ regionId: string; currencyCode: string }>
}

type HeaderReader = { get(name: string): string | null } | Record<string, string | string[] | undefined>

interface StorePhotoJobsHandlerRequest<Scope = unknown> {
  body?: unknown
  headers: HeaderReader
  auth_context?: { actor_id?: string | null }
  scope?: Scope
  params?: { id?: string }
}

interface StorePhotoJobsHandlerResponse {
  json(body: unknown): unknown
  status?(code: number): StorePhotoJobsHandlerResponse
}

function medusaError(type: string, code: string): MedusaError {
  return new MedusaError(type, code)
}

function notFound(): MedusaError {
  return medusaError(MedusaError.Types.NOT_FOUND, "photo_job_not_found")
}

function conflict(): MedusaError {
  return medusaError(MedusaError.Types.CONFLICT, "photo_job_conflict")
}

function invalidData(code = "invalid_photo_job_input"): MedusaError {
  return medusaError(MedusaError.Types.INVALID_DATA, code)
}

function customerId(req: StorePhotoJobsHandlerRequest): string | null {
  return req.auth_context?.actor_id?.trim() || null
}

function headerValue(headers: HeaderReader, name: string): string | null {
  if ("get" in headers && typeof headers.get === "function") {
    return headers.get(name)
  }

  const headerRecord = headers as Record<string, string | string[] | undefined>
  const direct = headerRecord[name] ?? headerRecord[name.toLowerCase()] ?? headerRecord[name.toUpperCase()]
  if (Array.isArray(direct)) {
    return direct[0] ?? null
  }

  return direct ?? null
}

function guestSecret(req: StorePhotoJobsHandlerRequest): string | null {
  return headerValue(req.headers, "x-fotomax-guest-token")?.trim() || null
}

function ownerContext(req: StorePhotoJobsHandlerRequest): PhotoOwnerContext {
  const currentCustomerId = customerId(req)
  if (currentCustomerId) {
    return { kind: "customer", customerId: currentCustomerId }
  }

  return resolvePhotoOwnerContext({
    guestSecret: guestSecret(req),
  })
}

function hasOwnerContext(req: StorePhotoJobsHandlerRequest): boolean {
  return Boolean(customerId(req) || guestSecret(req))
}

function jobId(req: StorePhotoJobsHandlerRequest): string {
  const id = req.params?.id?.trim()
  if (!id) {
    throw notFound()
  }
  return id
}

function readRevision(req: StorePhotoJobsHandlerRequest): number {
  const value = headerValue(req.headers, "if-match")?.trim()
  if (!value || !/^\d+$/.test(value)) {
    throw conflict()
  }
  return Number(value)
}

function isExpired(job: PhotoJobRecord): boolean {
  return job.status === "expired"
}

function ownerFilter(owner: PhotoOwnerContext): Record<string, unknown> {
  if (owner.kind === "customer") {
    return { customer_id: owner.customerId }
  }

  return { guest_owner_hash: owner.digest.toString("hex") }
}

function isOwnedByRequest(job: PhotoJobRecord, req: StorePhotoJobsHandlerRequest): boolean {
  const currentCustomerId = customerId(req)
  if (currentCustomerId) {
    return job.customer_id === currentCustomerId
  }

  const secret = guestSecret(req)
  return Boolean(
    secret
    && typeof job.guest_owner_hash === "string"
    && verifyGuestSecret(secret, job.guest_owner_hash),
  )
}

function assertVisible(job: PhotoJobRecord | null, req: StorePhotoJobsHandlerRequest): PhotoJobRecord {
  if (!job || isExpired(job) || !isOwnedByRequest(job, req)) {
    throw notFound()
  }

  return job
}

function ownerRevisionSelector(job: PhotoJobRecord, expectedRevision: number): Record<string, unknown> {
  return {
    id: job.id,
    revision: expectedRevision,
    guest_owner_hash: job.guest_owner_hash ?? null,
    customer_id: job.customer_id ?? null,
  }
}

function isSameCustomerClaimRetry(
  job: PhotoJobRecord | null,
  customerId: string,
  expectedRevision: number,
): job is PhotoJobRecord {
  return Boolean(
    job
    && !isExpired(job)
    && job.customer_id === customerId
    && (job.revision === expectedRevision || job.revision === expectedRevision + 1),
  )
}

function outputPhotoJob(job: PhotoJobRecord): Record<string, unknown> {
  const {
    guest_owner_hash: _guestOwnerHash,
    customer_id: _customerId,
    ...safeJob
  } = job
  return safeJob
}

function outputPhotoJobs(jobs: PhotoJobRecord[]): Array<Record<string, unknown>> {
  return jobs.filter((job) => !isExpired(job)).map(outputPhotoJob)
}

function outputPhotoAsset(asset: Record<string, unknown>): Record<string, unknown> {
  const safeFields = [
    "id", "display_name", "expected_bytes", "stored_bytes", "detected_mime_type",
    "status", "failure_code", "width", "height", "orientation", "quality_band",
    "estimated_ppi", "warnings", "errors", "processing_attempts",
  ] as const
  return Object.fromEntries(
    safeFields.filter((field) => field in asset).map((field) => [field, asset[field]]),
  )
}
function outputPrintItem(item: Record<string, unknown>): Record<string, unknown> {
  const safeFields = [
    "asset_id", "finish", "border", "crop_mode", "crop", "quantity",
    "warning_acknowledgements",
  ] as const
  return Object.fromEntries(
    safeFields.filter((field) => field in item).map((field) => [field, item[field]]),
  )
}

function outputActiveVersion(
  version: Record<string, unknown>,
  items: Array<Record<string, unknown>>,
): Record<string, unknown> {
  return { id: version.id, defaults: version.defaults, items: items.map(outputPrintItem) }
}

function parseCreateBody(body: unknown): { locale: "en" | "zh-HK" } {
  if (body === undefined || body === null) {
    return { locale: "en" }
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    throw invalidData()
  }

  const locale = Reflect.get(body, "locale")
  if (locale === undefined) {
    return { locale: "en" }
  }
  if (locale !== "en" && locale !== "zh-HK") {
    throw invalidData()
  }

  return { locale }
}

function isGeneratedNotFound(error: unknown): boolean {
  return error instanceof Error && /not found|no .*found/i.test(error.message)
}

function isSerializationFailure(error: unknown): boolean {
  return error instanceof Error && /serializ|40001/i.test(error.message)
}

export function createMedusaPhotoJobOperations(
  scope: MedusaRequest["scope"],
  sharedContext?: Record<string, unknown>,
): PhotoJobOperations {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const photoProductionService = scope.resolve<PhotoProductionModuleService>(
    PHOTO_PRODUCTION_MODULE,
  )

  const operations: PhotoJobOperations = {
    async createPhotoJob(input) {
      return sharedContext
        ? photoProductionService.createPhotoJob(input, sharedContext as never)
        : photoProductionService.createPhotoJob(input)
    },
    async listPhotoJobs(filters) {
      return sharedContext
        ? photoProductionService.listPhotoJobs(filters, {}, sharedContext as never)
        : photoProductionService.listPhotoJobs(filters)
    },
    async retrievePhotoJob(id) {
      try {
        return sharedContext
          ? await photoProductionService.retrievePhotoJob(id, {}, sharedContext as never)
          : await photoProductionService.retrievePhotoJob(id)
      } catch (error) {
        if (isGeneratedNotFound(error)) {
          return null
        }
        throw error
      }
    },
    async listPhotoAssets(jobId) {
      const assets = sharedContext
        ? await photoProductionService.listPhotoAssets({ job_id: jobId }, {}, sharedContext as never)
        : await photoProductionService.listPhotoAssets({ job_id: jobId })
      return assets.filter((asset: { status?: string }) => asset.status !== "deleted")
    },
    async retrievePhotoJobVersion(id) {
      try {
        return sharedContext
          ? await photoProductionService.retrievePhotoJobVersion(id, {}, sharedContext as never)
          : await photoProductionService.retrievePhotoJobVersion(id)
      } catch (error) {
        if (error instanceof Error && /not found|no .*found/i.test(error.message)) return null
        throw error
      }
    },
    async listPrintItems(versionId) {
      return sharedContext
        ? photoProductionService.listPrintItems({ version_id: versionId }, {}, sharedContext as never)
        : photoProductionService.listPrintItems({ version_id: versionId })
    },
    async updatePhotoJob(selector, data) {
      try {
        const update = { selector, data }
        const result = sharedContext
          ? await photoProductionService.updatePhotoJobs(update, sharedContext as never)
          : await photoProductionService.updatePhotoJobs(update)
        if (Array.isArray(result)) {
          return result[0] ?? null
        }
        return result ?? null
      } catch (error) {
        if (isGeneratedNotFound(error)) {
          return null
        }
        throw error
      }
    },
    async withTransaction(callback) {
      if (sharedContext?.transactionManager) {
        return callback(operations)
      }

      try {
        return await photoProductionService.withPhotoJobTransaction(
          (transactionContext) => callback(createMedusaPhotoJobOperations(scope, transactionContext)),
          { isolationLevel: "SERIALIZABLE" },
        )
      } catch (error) {
        if (isSerializationFailure(error)) {
          throw conflict()
        }
        throw error
      }
    },
    async resolveHongKongPhotoProduct() {
      const regionResult = await query.graph({
        entity: "region",
        fields: ["id", "currency_code", "countries.iso_2"],
        filters: { name: "Hong Kong" },
      })
      const region = regionResult.data.find((candidate: {
        id?: string
        currency_code?: string
        countries?: Array<{ iso_2?: string | null }> | null
      }) =>
        typeof candidate.id === "string"
        && candidate.currency_code?.toLowerCase() === "hkd"
        && candidate.countries?.some((country) => country.iso_2?.toLowerCase() === "hk"),
      )
      if (!region?.id) {
        throw invalidData("photo_region_unavailable")
      }

      const productResult = await query.graph({
        entity: "product",
        fields: ["id", "handle", "status"],
        filters: { handle: PHOTO_PRODUCT_HANDLE, status: "published" },
      })
      if (!productResult.data.some((product: { handle?: string; status?: string }) =>
        product.handle === PHOTO_PRODUCT_HANDLE && product.status === "published",
      )) {
        throw invalidData("photo_product_unavailable")
      }

      return { regionId: region.id, currencyCode: "hkd" }
    },
  }

  return operations
}

export async function handleStorePhotoJobsPost<Scope>(
  req: StorePhotoJobsHandlerRequest<Scope>,
  res: StorePhotoJobsHandlerResponse,
  createOperations: (scope: Scope) => PhotoJobOperations,
): Promise<void> {
  const owner = ownerContext(req)
  const input = parseCreateBody(req.body)
  const operations = createOperations(req.scope as Scope)
  const productContext = await operations.resolveHongKongPhotoProduct()
  const now = new Date()
  const ownerInput = owner.kind === "customer"
    ? { customer_id: owner.customerId, guest_owner_hash: null }
    : { guest_owner_hash: owner.digest.toString("hex"), customer_id: null }

  const photoJob = await operations.createPhotoJob({
    ...ownerInput,
    region_id: productContext.regionId,
    locale: input.locale,
    currency_code: productContext.currencyCode,
    product_handle: PHOTO_PRODUCT_HANDLE,
    status: "draft",
    revision: 0,
    retention_class: "standard",
    last_activity_at: now,
  })

  res.json({ photo_job: outputPhotoJob(photoJob) })
}

export async function handleStorePhotoJobsGet<Scope>(
  req: StorePhotoJobsHandlerRequest<Scope>,
  res: StorePhotoJobsHandlerResponse,
  createOperations: (scope: Scope) => PhotoJobOperations,
): Promise<void> {
  if (!hasOwnerContext(req)) {
    res.json({ photo_jobs: [] })
    return
  }

  const owner = ownerContext(req)
  const jobs = await createOperations(req.scope as Scope).listPhotoJobs(ownerFilter(owner))
  res.json({ photo_jobs: outputPhotoJobs(jobs) })
}

export async function handleStorePhotoJobGet<Scope>(
  req: StorePhotoJobsHandlerRequest<Scope>,
  res: StorePhotoJobsHandlerResponse,
  createOperations: (scope: Scope) => PhotoJobOperations,
): Promise<void> {
  const operations = createOperations(req.scope as Scope)
  const job = assertVisible(
    await operations.retrievePhotoJob(jobId(req)),
    req,
  )
  const assets = await operations.listPhotoAssets(job.id)
  let activeVersion: Record<string, unknown> | undefined
  if (typeof job.active_version_id === "string" && job.active_version_id) {
    const version = await operations.retrievePhotoJobVersion(job.active_version_id)
    if (version) {
      const items = await operations.listPrintItems(job.active_version_id)
      activeVersion = outputActiveVersion(version, items)
    }
  }
  res.json({ photo_job: {
    ...outputPhotoJob(job),
    assets: assets.map(outputPhotoAsset),
    ...(activeVersion ? { active_version: activeVersion } : {}),
  } })
}

export async function handleStorePhotoJobDelete<Scope>(
  req: StorePhotoJobsHandlerRequest<Scope>,
  res: StorePhotoJobsHandlerResponse,
  createOperations: (scope: Scope) => PhotoJobOperations,
): Promise<void> {
  const operations = createOperations(req.scope as Scope)
  await operations.withTransaction(async (transactionOperations) => {
    const id = jobId(req)
    const job = assertVisible(await transactionOperations.retrievePhotoJob(id), req)
    const expectedRevision = readRevision(req)
    if (expectedRevision !== job.revision) {
      throw conflict()
    }
    try {
      assertPhotoJobTransition(job.status as PhotoJobStatus, "cancelled")
    } catch {
      throw conflict()
    }

    const updated = await transactionOperations.updatePhotoJob(ownerRevisionSelector(job, expectedRevision), {
      status: "cancelled",
      revision: job.revision + 1,
      cancelled_at: new Date(),
      last_activity_at: new Date(),
    })
    if (!updated) {
      throw conflict()
    }
    res.json({ photo_job: outputPhotoJob(updated) })
  })
}

export async function handleStorePhotoJobClaimPost<Scope>(
  req: StorePhotoJobsHandlerRequest<Scope>,
  res: StorePhotoJobsHandlerResponse,
  createOperations: (scope: Scope) => PhotoJobOperations,
): Promise<void> {
  const currentCustomerId = customerId(req)
  if (!currentCustomerId) {
    throw notFound()
  }

  const operations = createOperations(req.scope as Scope)
  await operations.withTransaction(async (transactionOperations) => {
    const id = jobId(req)
    const job = await transactionOperations.retrievePhotoJob(id)
    if (!job || isExpired(job)) {
      throw notFound()
    }

    if (job.customer_id === currentCustomerId) {
      const expectedRevision = readRevision(req)
      if (isSameCustomerClaimRetry(job, currentCustomerId, expectedRevision)) {
        res.json({ photo_job: outputPhotoJob(job) })
        return
      }
      throw conflict()
    }
    if (job.customer_id || !job.guest_owner_hash) {
      throw notFound()
    }

    const secret = guestSecret(req)
    if (!secret || !verifyGuestSecret(secret, job.guest_owner_hash)) {
      throw notFound()
    }

    const expectedRevision = readRevision(req)
    if (expectedRevision !== job.revision) {
      throw conflict()
    }
    const updated = await transactionOperations.updatePhotoJob(ownerRevisionSelector(job, expectedRevision), {
      guest_owner_hash: null,
      customer_id: currentCustomerId,
      revision: job.revision + 1,
      last_activity_at: new Date(),
    })
    if (updated) {
      res.json({ photo_job: outputPhotoJob(updated) })
      return
    }

    const latest = await transactionOperations.retrievePhotoJob(id)
    if (isSameCustomerClaimRetry(latest, currentCustomerId, expectedRevision)) {
      res.json({ photo_job: outputPhotoJob(latest) })
      return
    }
    throw conflict()
  })
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  await handleStorePhotoJobsPost(req, res, createMedusaPhotoJobOperations)
}

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  await handleStorePhotoJobsGet(req, res, createMedusaPhotoJobOperations)
}
