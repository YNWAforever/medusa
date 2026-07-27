import { NextRequest, NextResponse } from "next/server"

import { CUSTOMER_TOKEN_COOKIE } from "../../../../../src/lib/medusa/session"
import { getStorefrontEnv } from "../../../../../src/lib/medusa/env"
import {
  configuredStorefrontOrigin,
  isAllowedPhotoMutationOrigin,
  PHOTO_GUEST_COOKIE,
  photoRequestHeaders,
  validPhotoGuestSecret,
} from "../../../../../src/lib/photo/ownership"

type RouteContext = { params: Promise<{ jobId: string }> }

function endpoint(jobId: string): string {
  const env = getStorefrontEnv()
  return new URL(`/store/photo-jobs/${encodeURIComponent(jobId)}/claim`, env.backendUrl).toString()
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

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const originError = mutationForbidden(request)
  if (originError) {
    return originError
  }

  try {
    const env = getStorefrontEnv()
    const { jobId } = await params
    const guestSecret = request.cookies.get(PHOTO_GUEST_COOKIE)?.value
    const response = await fetch(endpoint(jobId), {
      method: "POST",
      headers: {
        ...photoRequestHeaders({
          customerToken: request.cookies.get(CUSTOMER_TOKEN_COOKIE)?.value,
          guestSecret: validPhotoGuestSecret(guestSecret) ? guestSecret : undefined,
          includeGuestWithCustomer: true,
          extra: { "x-publishable-api-key": env.publishableKey },
        }),
        ...(request.headers.get("if-match") ? { "if-match": request.headers.get("if-match") as string } : {}),
      },
      cache: "no-store",
    })
    return proxyJson(response)
  } catch {
    return unavailableResponse()
  }
}
