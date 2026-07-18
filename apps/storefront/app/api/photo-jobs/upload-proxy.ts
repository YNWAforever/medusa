import { NextRequest, NextResponse } from "next/server"

import { getStorefrontEnv } from "../../../src/lib/medusa/env"
import { CUSTOMER_TOKEN_COOKIE } from "../../../src/lib/medusa/session"
import { configuredStorefrontOrigin, isAllowedPhotoMutationOrigin, PHOTO_GUEST_COOKIE, photoRequestHeaders, validPhotoGuestSecret } from "../../../src/lib/photo/ownership"

const PRIVATE_KEYS = new Set(["object_key", "provider_upload_id", "guest_owner_hash", "customer_id", "stack", "cause"])

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => !PRIVATE_KEYS.has(key)).map(([key, child]) => [key, sanitize(child)]))
}

function response(body: unknown, status: number): NextResponse {
  return NextResponse.json(sanitize(body), { status, headers: { "cache-control": "no-store" } })
}

export async function proxyUploadMutation(request: NextRequest, path: string): Promise<NextResponse> {
  const configuredOrigin = configuredStorefrontOrigin(request.nextUrl.origin)
  if (!isAllowedPhotoMutationOrigin(request.headers, configuredOrigin)) return response({ error: { code: "photo_job_origin_forbidden" } }, 403)

  let body: unknown
  try { body = await request.json() } catch { return response({ error: { code: "photo_upload_invalid_input" } }, 400) }

  try {
    const env = getStorefrontEnv()
    const customerToken = request.cookies.get(CUSTOMER_TOKEN_COOKIE)?.value
    const candidate = request.cookies.get(PHOTO_GUEST_COOKIE)?.value
    const guestSecret = validPhotoGuestSecret(candidate) ? candidate : undefined
    const upstream = await fetch(new URL(path, env.backendUrl), {
      method: "POST",
      headers: photoRequestHeaders({ customerToken, guestSecret, extra: { "x-publishable-api-key": env.publishableKey, "content-type": "application/json" } }),
      body: JSON.stringify(body),
      cache: "no-store",
    })
    const payload = await upstream.json().catch(() => ({ error: { code: "photo_job_unavailable" } }))
    return response(payload, upstream.status)
  } catch {
    return response({ error: { code: "photo_job_unavailable" } }, 502)
  }
}
