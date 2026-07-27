import { NextRequest, NextResponse } from "next/server"

import { CUSTOMER_TOKEN_COOKIE } from "../../../../src/lib/medusa/session"
import { getStorefrontEnv } from "../../../../src/lib/medusa/env"
import {
  configuredStorefrontOrigin,
  isAllowedPhotoMutationOrigin,
  PHOTO_GUEST_COOKIE,
  photoJobResponse,
  photoRequestHeaders,
  validPhotoGuestSecret,
} from "../../../../src/lib/photo/ownership"

type RouteContext = { params: Promise<{ jobId: string }> }

function endpoint(jobId: string): string {
  const env = getStorefrontEnv()
  return new URL(`/store/photo-jobs/${encodeURIComponent(jobId)}`, env.backendUrl).toString()
}

function validGuestSecret(request: NextRequest): string | undefined {
  const secret = request.cookies.get(PHOTO_GUEST_COOKIE)?.value
  return validPhotoGuestSecret(secret) ? secret : undefined
}

function medusaHeaders(request: NextRequest): Record<string, string> {
  const env = getStorefrontEnv()
  return photoRequestHeaders({
    customerToken: request.cookies.get(CUSTOMER_TOKEN_COOKIE)?.value,
    guestSecret: validGuestSecret(request),
    extra: { "x-publishable-api-key": env.publishableKey },
  })
}

function mutationForbidden(request: NextRequest): NextResponse | null {
  const configuredOrigin = configuredStorefrontOrigin(request.nextUrl.origin)
  if (isAllowedPhotoMutationOrigin(request.headers, configuredOrigin)) {
    return null
  }

  return NextResponse.json({ error: { code: "photo_job_origin_forbidden" } }, { status: 403, headers: { "cache-control": "no-store" } })
}

async function proxyJson(response: Response): Promise<NextResponse> {
  const body = await response.json().catch(() => ({ error: { code: "photo_job_unavailable" } }))
  return NextResponse.json(body, { status: response.status, headers: { "cache-control": "no-store" } })
}

function unavailableResponse(): NextResponse {
  return NextResponse.json({ error: { code: "photo_job_unavailable" } }, { status: 502, headers: { "cache-control": "no-store" } })
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  try {
    const { jobId } = await params
    const response = await fetch(endpoint(jobId), {
      headers: medusaHeaders(request),
      cache: "no-store",
    })
    const customerToken = request.cookies.get(CUSTOMER_TOKEN_COOKIE)?.value
    const guestSecret = customerToken ? undefined : validGuestSecret(request)
    const body = await response.json().catch(() => ({ error: { code: "photo_job_unavailable" } }))
    const result = photoJobResponse(body, response.ok ? guestSecret : undefined, response.status)
    result.headers.set("cache-control", "no-store")
    return result
  } catch {
    return unavailableResponse()
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const originError = mutationForbidden(request)
  if (originError) {
    return originError
  }

  try {
    const { jobId } = await params
    const response = await fetch(endpoint(jobId), {
      method: "DELETE",
      headers: {
        ...medusaHeaders(request),
        ...(request.headers.get("if-match") ? { "if-match": request.headers.get("if-match") as string } : {}),
      },
      cache: "no-store",
    })
    return proxyJson(response)
  } catch {
    return unavailableResponse()
  }
}
