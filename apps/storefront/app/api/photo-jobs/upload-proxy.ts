import { NextRequest, NextResponse } from "next/server"
import { getStorefrontEnv } from "../../../src/lib/medusa/env"
import { CUSTOMER_TOKEN_COOKIE } from "../../../src/lib/medusa/session"
import { configuredStorefrontOrigin, isAllowedPhotoMutationOrigin, PHOTO_GUEST_COOKIE, photoRequestHeaders, validPhotoGuestSecret } from "../../../src/lib/photo/ownership"

const SAFE_UPLOAD_HEADERS = new Set([
  "content-type",
  "x-amz-server-side-encryption",
  "x-amz-checksum-crc32c",
  "x-amz-sdk-checksum-algorithm",
])

function unavailable(): never {
  throw new Error("photo_job_unavailable")
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) unavailable()
  return value as Record<string, unknown>
}

function nonblank(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) unavailable()
  return value
}

function safeRequiredHeaders(value: unknown): Record<string, string> {
  const headers = record(value)
  const safe: Record<string, string> = {}
  for (const [name, headerValue] of Object.entries(headers)) {
    if (!SAFE_UPLOAD_HEADERS.has(name.toLowerCase())) continue
    safe[name] = nonblank(headerValue)
  }
  return safe
}

function projectUpload(value: unknown) {
  const upload = record(value)
  const status = nonblank(upload.status)
  const common = {
    assetId: nonblank(upload.assetId),
    sessionId: nonblank(upload.sessionId),
    status,
    expiresAt: nonblank(upload.expiresAt),
  }

  if (status === "completed") {
    if (upload.strategy !== "single-put" && upload.strategy !== "multipart")
      unavailable()
    return { ...common, strategy: upload.strategy }
  }

  if (status !== "active") unavailable()
  const strategy = upload.strategy ?? "multipart"

  if (strategy === "single-put") {
    if ("partSize" in upload) unavailable()
    return {
      ...common,
      strategy,
      uploadUrl: nonblank(upload.uploadUrl),
      requiredHeaders: safeRequiredHeaders(upload.requiredHeaders),
    }
  }

  if (strategy === "multipart") {
    if ("uploadUrl" in upload || "requiredHeaders" in upload) unavailable()
    if (!Number.isSafeInteger(upload.partSize) || (upload.partSize as number) <= 0)
      unavailable()
    return { ...common, strategy, partSize: upload.partSize as number }
  }

  return unavailable()
}

function projectPart(value: unknown) {
  const part = record(value)
  return {
    url: nonblank(part.url),
    requiredHeaders: safeRequiredHeaders(part.requiredHeaders ?? {}),
  }
}

function projectAsset(value: unknown) {
  const asset = record(value)
  return {
    id: asset.id,
    display_name: asset.display_name,
    expected_bytes: asset.expected_bytes,
    stored_bytes: asset.stored_bytes,
    detected_mime_type: asset.detected_mime_type,
    status: asset.status,
    failure_code: asset.failure_code,
  }
}

export function projectUploadProxyPayload(payload: unknown): unknown {
  const upstream = record(payload)
  if ("upload" in upstream) return { upload: projectUpload(upstream.upload) }
  if ("part" in upstream) return { part: projectPart(upstream.part) }
  if ("asset" in upstream) return { asset: projectAsset(upstream.asset) }
  return {
    error: {
      code: typeof (upstream.error as { code?: unknown } | undefined)?.code === "string"
        ? (upstream.error as { code: string }).code
        : "photo_job_unavailable",
    },
  }
}

function response(body: unknown, status: number): NextResponse {
  return NextResponse.json(projectUploadProxyPayload(body), {
    status,
    headers: { "cache-control": "no-store" },
  })
}

export async function proxyUploadMutation(request: NextRequest, path: string): Promise<NextResponse> {
  if (!isAllowedPhotoMutationOrigin(request.headers, configuredStorefrontOrigin(request.nextUrl.origin)))
    return response({ error: { code: "photo_job_origin_forbidden" } }, 403)
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return response({ error: { code: "photo_upload_invalid_input" } }, 400)
  }
  try {
    const env = getStorefrontEnv()
    const customerToken = request.cookies.get(CUSTOMER_TOKEN_COOKIE)?.value
    const candidate = request.cookies.get(PHOTO_GUEST_COOKIE)?.value
    const guestSecret = validPhotoGuestSecret(candidate) ? candidate : undefined
    const upstream = await fetch(new URL(path, env.backendUrl), {
      method: "POST",
      headers: photoRequestHeaders({
        customerToken,
        guestSecret,
        extra: {
          "x-publishable-api-key": env.publishableKey,
          "content-type": "application/json",
        },
      }),
      body: JSON.stringify(body),
      cache: "no-store",
    })
    const payload = await upstream.json().catch(() => ({
      error: { code: "photo_job_unavailable" },
    }))
    return response(payload, upstream.status)
  } catch {
    return response({ error: { code: "photo_job_unavailable" } }, 502)
  }
}

export async function proxyAssetDelete(request: NextRequest, path: string): Promise<NextResponse> {
  if (!isAllowedPhotoMutationOrigin(request.headers, configuredStorefrontOrigin(request.nextUrl.origin)))
    return response({ error: { code: "photo_job_origin_forbidden" } }, 403)
  try {
    const env = getStorefrontEnv()
    const customerToken = request.cookies.get(CUSTOMER_TOKEN_COOKIE)?.value
    const candidate = request.cookies.get(PHOTO_GUEST_COOKIE)?.value
    const guestSecret = validPhotoGuestSecret(candidate) ? candidate : undefined
    const upstream = await fetch(new URL(path, env.backendUrl), {
      method: "DELETE",
      headers: photoRequestHeaders({
        customerToken,
        guestSecret,
        extra: { "x-publishable-api-key": env.publishableKey },
      }),
      cache: "no-store",
    })
    const payload = await upstream.json().catch(() => ({
      error: { code: "photo_job_unavailable" },
    }))
    return response(payload, upstream.status)
  } catch {
    return response({ error: { code: "photo_job_unavailable" } }, 502)
  }
}
