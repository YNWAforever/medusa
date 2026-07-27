import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { PHOTO_PRODUCTION_MODULE } from "../../../../../modules/photo-production"
import { verifyGuestSecret } from "../../../../../modules/photo-production/ownership"
import { attachPhotoJobToCart } from "../../../../../workflows/attach-photo-job-to-cart"
import { detachPhotoJobFromCart } from "../../../../../workflows/detach-photo-job-from-cart"
import { createPhotoCartRuntime } from "../../../../../workflows/photo-cart-runtime"

type RequestLike<Scope = unknown> = {
  body?: unknown
  params?: { id?: string }
  headers: { get?(name: string): string | null } | Record<string, string | undefined>
  auth_context?: { actor_id?: string | null }
  scope?: Scope
}
type ResponseLike = { json(body: unknown): unknown }

export interface PhotoCartRouteDependencies {
  assertOwner(jobId: string, request: RequestLike): Promise<void>
  attach(jobId: string, cartId: string): Promise<unknown>
  detach(jobId: string, cartId: string): Promise<unknown>
}

function invalid(code: string): MedusaError {
  return new MedusaError(MedusaError.Types.INVALID_DATA, code)
}


export function asPhotoCartRouteError(error: unknown): Error {
  if (error instanceof MedusaError) return error
  const code = error instanceof Error ? error.message : "photo_cart_unavailable"
  const notFoundCodes = new Set(["photo_job_not_found", "photo_cart_not_found"])
  const invalidCodes = new Set(["photo_cart_id_required", "photo_items_unavailable"])
  const type = notFoundCodes.has(code)
    ? MedusaError.Types.NOT_FOUND
    : invalidCodes.has(code)
      ? MedusaError.Types.INVALID_DATA
      : MedusaError.Types.CONFLICT
  return new MedusaError(type, code)
}
function parse(request: RequestLike): { jobId: string; cartId: string } {
  const jobId = request.params?.id?.trim()
  const cartId = request.body && typeof request.body === "object" && !Array.isArray(request.body)
    ? Reflect.get(request.body, "cartId")
    : null
  if (!jobId) throw new MedusaError(MedusaError.Types.NOT_FOUND, "photo_job_not_found")
  if (typeof cartId !== "string" || !cartId.trim()) throw invalid("photo_cart_id_required")
  return { jobId, cartId: cartId.trim() }
}

export async function handlePhotoCartPost(
  request: RequestLike,
  response: ResponseLike,
  dependencies: PhotoCartRouteDependencies,
): Promise<void> {
  const { jobId, cartId } = parse(request)
  await dependencies.assertOwner(jobId, request)
  const cart = await dependencies.attach(jobId, cartId)
  response.json({ cart })
}

export async function handlePhotoCartDelete(
  request: RequestLike,
  response: ResponseLike,
  dependencies: PhotoCartRouteDependencies,
): Promise<void> {
  const { jobId, cartId } = parse(request)
  await dependencies.assertOwner(jobId, request)
  const cart = await dependencies.detach(jobId, cartId)
  response.json({ cart })
}

function header(request: RequestLike, name: string): string {
  const headers = request.headers as any
  return (headers.get?.(name) ?? headers[name] ?? headers[name.toLowerCase()] ?? "").trim()
}

function createDependencies(request: MedusaRequest): PhotoCartRouteDependencies {
  const runtime = createPhotoCartRuntime(request.scope)
  const service: any = request.scope.resolve(PHOTO_PRODUCTION_MODULE)
  return {
    assertOwner: async (jobId, current) => {
      let job: any
      try { job = await service.retrievePhotoJob(jobId) } catch {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, "photo_job_not_found")
      }
      const customerId = current.auth_context?.actor_id?.trim()
      const guestToken = header(current, "x-fotomax-guest-token")
      const owned = customerId
        ? job.customer_id === customerId
        : Boolean(guestToken && job.guest_owner_hash && verifyGuestSecret(guestToken, job.guest_owner_hash))
      if (!owned || job.status === "expired") {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, "photo_job_not_found")
      }
    },
    attach: (jobId, cartId) => attachPhotoJobToCart({ jobId, cartId }, runtime.attach),
    detach: (jobId, cartId) => detachPhotoJobFromCart({ jobId, cartId }, runtime.detach),
  }
}

export async function POST(request: MedusaRequest, response: MedusaResponse): Promise<void> {
  try {
    await handlePhotoCartPost(request as unknown as RequestLike, response, createDependencies(request))
  } catch (error) {
    throw asPhotoCartRouteError(error)
  }
}

export async function DELETE(request: MedusaRequest, response: MedusaResponse): Promise<void> {
  try {
    await handlePhotoCartDelete(request as unknown as RequestLike, response, createDependencies(request))
  } catch (error) {
    throw asPhotoCartRouteError(error)
  }
}
