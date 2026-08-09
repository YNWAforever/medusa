import { MedusaError } from "@medusajs/framework/utils"
import type { CreatePhotoVersionInput } from "../../../workflows/create-photo-job-version"

type Request = {
  params?: { id?: string }
  headers: { get?(name: string): string | null; [key: string]: unknown }
  body?: unknown
}

type Response = {
  json(body: unknown): unknown
  setHeader?(name: string, value: string): unknown
}

export type VersionRouteDependencies = {
  assertOwner(jobId: string, request: Request): Promise<void>
  createVersion(input: CreatePhotoVersionInput): Promise<any>
  quoteVersion(input: { jobId: string; versionId: string; fulfillment?: { type: "delivery" | "pickup"; branchId?: string } }): Promise<any>
}

function header(request: Request, name: string): string | null {
  const value = request.headers.get?.(name)
    ?? request.headers[name]
    ?? request.headers[name.toLowerCase()]
  return typeof value === "string" ? value.trim() || null : null
}

function jobId(request: Request) {
  const value = request.params?.id?.trim()
  if (!value) throw new Error("photo_job_not_found")
  return value
}

function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("photo_version_input_invalid")
  }
  return value as Record<string, any>
}

export function asPhotoVersionRouteError(error: unknown): Error {
  if (error instanceof MedusaError) return error
  const code = error instanceof Error ? error.message : "photo_version_unavailable"
  const type = code === "photo_job_not_found" || code === "photo_version_not_found"
    ? MedusaError.Types.NOT_FOUND
    : code === "photo_job_conflict"
      ? MedusaError.Types.CONFLICT
      : MedusaError.Types.INVALID_DATA
  return new MedusaError(type, code)
}
const clientPriceKeys = new Set([
  "price", "unitprice", "unit_price", "amount", "subtotal",
  "currency", "currencycode", "currency_code",
])

function containsClientPrice(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  if (Array.isArray(value)) return value.some(containsClientPrice)
  return Object.entries(value).some(([key, nested]) =>
    clientPriceKeys.has(key.toLowerCase()) || containsClientPrice(nested),
  )
}
export async function handleCreateVersion(
  request: Request,
  response: Response,
  dependencies: VersionRouteDependencies,
) {
  const id = jobId(request)
  const idempotencyKey = header(request, "idempotency-key")
  if (!idempotencyKey || idempotencyKey.length > 200) {
    throw new Error("photo_idempotency_key_required")
  }
  const body = record(request.body)
  if (containsClientPrice(body)) throw new Error("photo_client_price_forbidden")
  if (
    !Number.isInteger(body.expectedRevision)
    || body.expectedRevision < 0
    || !body.defaults
    || typeof body.defaults !== "object"
    || Array.isArray(body.defaults)
    || !Array.isArray(body.overrides ?? [])
    || !Array.isArray(body.warningAcknowledgements ?? [])
  ) throw new Error("photo_version_input_invalid")
  await dependencies.assertOwner(id, request)
  const result = await dependencies.createVersion({
    jobId: id,
    idempotencyKey,
    expectedRevision: body.expectedRevision,
    defaults: body.defaults,
    overrides: body.overrides ?? [],
    warningAcknowledgements: body.warningAcknowledgements ?? [],
  })
  response.setHeader?.("cache-control", "private, no-store")
  response.json(result)
}

export async function handleQuoteVersion(
  request: Request,
  response: Response,
  dependencies: VersionRouteDependencies,
) {
  const id = jobId(request)
  const body = record(request.body)
  if (containsClientPrice(body)) throw new Error("photo_client_price_forbidden")
  const versionId = typeof body.versionId === "string" ? body.versionId.trim() : ""
  if (!versionId) throw new Error("photo_version_input_invalid")
  await dependencies.assertOwner(id, request)
  const fulfillment = body.fulfillment
  if (fulfillment !== undefined && (
    !fulfillment
    || typeof fulfillment !== "object"
    || (fulfillment.type !== "delivery" && fulfillment.type !== "pickup")
    || (fulfillment.type === "pickup" && typeof fulfillment.branchId !== "string")
  )) throw new Error("photo_capability_unavailable")
  const quote = await dependencies.quoteVersion({
    jobId: id,
    versionId,
    ...(fulfillment ? { fulfillment } : {}),
  })
  response.setHeader?.("cache-control", "private, no-store")
  response.json({ quote })
}
