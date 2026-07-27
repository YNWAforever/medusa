import { NextRequest, NextResponse } from "next/server"

import { CUSTOMER_TOKEN_COOKIE } from "../../../src/lib/medusa/session"
import { getStorefrontEnv } from "../../../src/lib/medusa/env"
import {
  configuredStorefrontOrigin,
  createPhotoGuestSecret,
  isAllowedPhotoMutationOrigin,
  PHOTO_GUEST_COOKIE,
  photoJobResponse,
  validPhotoGuestSecret,
  photoRequestHeaders,
} from "../../../src/lib/photo/ownership"

function medusaHeaders(request: NextRequest, options: {
  includeGuestWithCustomer?: boolean
  contentType?: boolean
} = {}): Record<string, string> {
  const env = getStorefrontEnv()
  return photoRequestHeaders({
    customerToken: request.cookies.get(CUSTOMER_TOKEN_COOKIE)?.value,
    guestSecret: requestGuestSecret(request),
    includeGuestWithCustomer: options.includeGuestWithCustomer,
    extra: {
      "x-publishable-api-key": env.publishableKey,
      ...(options.contentType ? { "content-type": "application/json" } : {}),
    },
  })
}

function endpoint(path: string): string {
  const env = getStorefrontEnv()
  return new URL(path, env.backendUrl).toString()
}

function mutationForbidden(request: NextRequest): NextResponse | null {
  const configuredOrigin = configuredStorefrontOrigin(request.nextUrl.origin)
  if (isAllowedPhotoMutationOrigin(request.headers, configuredOrigin)) {
    return null
  }

  return NextResponse.json({ error: { code: "photo_job_origin_forbidden" } }, { status: 403, headers: { "cache-control": "no-store" } })
}

async function proxyJson(response: Response, guestSecret?: string): Promise<NextResponse> {
  const body = await response.json().catch(() => ({ error: { code: "photo_job_unavailable" } }))
  return photoJobResponse(body, guestSecret, response.status)
}

async function parseOptionalJsonBody(request: NextRequest): Promise<unknown> {
  const rawBody = await request.text()
  if (!rawBody.trim()) {
    return {}
  }

  return JSON.parse(rawBody)
}

function requestGuestSecret(request: NextRequest): string | undefined {
  const customerToken = request.cookies.get(CUSTOMER_TOKEN_COOKIE)?.value
  if (customerToken) {
    return undefined
  }

  const guestSecret = request.cookies.get(PHOTO_GUEST_COOKIE)?.value
  return validPhotoGuestSecret(guestSecret) ? guestSecret : undefined
}

function unavailableResponse(): NextResponse {
  return NextResponse.json({ error: { code: "photo_job_unavailable" } }, { status: 502, headers: { "cache-control": "no-store" } })
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const response = await fetch(endpoint("/store/photo-jobs"), {
      headers: medusaHeaders(request),
      cache: "no-store",
    })
    return proxyJson(response, requestGuestSecret(request))
  } catch {
    return unavailableResponse()
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const originError = mutationForbidden(request)
  if (originError) {
    return originError
  }

  const customerToken = request.cookies.get(CUSTOMER_TOKEN_COOKIE)?.value
  const existingGuestSecret = requestGuestSecret(request)
  const generatedGuestSecret = customerToken || existingGuestSecret
    ? undefined
    : createPhotoGuestSecret()
  const guestSecret = existingGuestSecret ?? generatedGuestSecret
  const responseGuestSecret = customerToken ? undefined : guestSecret

  let body: unknown
  try {
    body = await parseOptionalJsonBody(request)
  } catch {
    return NextResponse.json({ error: { code: "invalid_photo_job_input" } }, { status: 400, headers: { "cache-control": "no-store" } })
  }

  try {
    const response = await fetch(endpoint("/store/photo-jobs"), {
      method: "POST",
      headers: photoRequestHeaders({
        customerToken,
        guestSecret,
        extra: {
          "x-publishable-api-key": getStorefrontEnv().publishableKey,
          "content-type": "application/json",
        },
      }),
      body: JSON.stringify(body),
      cache: "no-store",
    })
    return proxyJson(response, responseGuestSecret)
  } catch {
    return unavailableResponse()
  }
}
