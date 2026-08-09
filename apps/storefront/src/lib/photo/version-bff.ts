import { NextRequest, NextResponse } from "next/server"
import { getStorefrontEnv } from "../medusa/env"
import { CUSTOMER_TOKEN_COOKIE } from "../medusa/session"
import {
  configuredStorefrontOrigin,
  isAllowedPhotoMutationOrigin,
  PHOTO_GUEST_COOKIE,
  photoRequestHeaders,
  validPhotoGuestSecret,
} from "./ownership"

export async function proxyPhotoVersionMutation(
  request: NextRequest,
  jobId: string,
  operation: "versions" | "quote",
): Promise<NextResponse> {
  const configuredOrigin = configuredStorefrontOrigin(request.nextUrl.origin)
  if (!isAllowedPhotoMutationOrigin(request.headers, configuredOrigin)) {
    return NextResponse.json(
      { error: { code: "photo_job_origin_forbidden" } },
      { status: 403, headers: { "cache-control": "private, no-store" } },
    )
  }
  try {
    const env = getStorefrontEnv()
    const candidate = request.cookies.get(PHOTO_GUEST_COOKIE)?.value
    const guestSecret = validPhotoGuestSecret(candidate) ? candidate : undefined
    const extra: Record<string, string> = {
      "content-type": "application/json",
      "x-publishable-api-key": env.publishableKey,
    }
    const idempotencyKey = request.headers.get("idempotency-key")
    if (operation === "versions" && idempotencyKey) {
      extra["idempotency-key"] = idempotencyKey
    }
    const upstream = await fetch(
      new URL(`/store/photo-jobs/${encodeURIComponent(jobId)}/${operation}`, env.backendUrl),
      {
        method: "POST",
        headers: photoRequestHeaders({
          customerToken: request.cookies.get(CUSTOMER_TOKEN_COOKIE)?.value,
          guestSecret,
          extra,
        }),
        body: await request.text(),
        cache: "no-store",
      },
    )
    const body = await upstream.json().catch(() => ({ error: { code: "photo_job_unavailable" } }))
    return NextResponse.json(body, {
      status: upstream.status,
      headers: { "cache-control": "private, no-store" },
    })
  } catch {
    return NextResponse.json(
      { error: { code: "photo_job_unavailable" } },
      { status: 502, headers: { "cache-control": "private, no-store" } },
    )
  }
}
