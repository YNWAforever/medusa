import { NextRequest, NextResponse } from "next/server"
import { getStorefrontEnv } from "../../../src/lib/medusa/env"
import { CUSTOMER_TOKEN_COOKIE } from "../../../src/lib/medusa/session"
import { configuredStorefrontOrigin, isAllowedPhotoMutationOrigin, PHOTO_GUEST_COOKIE, photoRequestHeaders, validPhotoGuestSecret } from "../../../src/lib/photo/ownership"
function project(payload: any): unknown {
  if (payload?.upload) return { upload: { assetId: payload.upload.assetId, sessionId: payload.upload.sessionId, partSize: payload.upload.partSize, status: payload.upload.status, expiresAt: payload.upload.expiresAt } }
  if (payload?.part) return { part: { url: payload.part.url, requiredHeaders: payload.part.requiredHeaders ?? {} } }
  if (payload?.asset) return { asset: { id: payload.asset.id, display_name: payload.asset.display_name, expected_bytes: payload.asset.expected_bytes, stored_bytes: payload.asset.stored_bytes, detected_mime_type: payload.asset.detected_mime_type, status: payload.asset.status, failure_code: payload.asset.failure_code } }
  return { error: { code: typeof payload?.error?.code === "string" ? payload.error.code : "photo_job_unavailable" } }
}
function response(body: unknown, status: number): NextResponse { return NextResponse.json(project(body), { status, headers: { "cache-control": "no-store" } }) }
export async function proxyUploadMutation(request: NextRequest, path: string): Promise<NextResponse> {
  if (!isAllowedPhotoMutationOrigin(request.headers, configuredStorefrontOrigin(request.nextUrl.origin))) return response({ error: { code: "photo_job_origin_forbidden" } }, 403)
  let body: unknown; try { body = await request.json() } catch { return response({ error: { code: "photo_upload_invalid_input" } }, 400) }
  try { const env = getStorefrontEnv(); const customerToken = request.cookies.get(CUSTOMER_TOKEN_COOKIE)?.value; const candidate = request.cookies.get(PHOTO_GUEST_COOKIE)?.value; const guestSecret = validPhotoGuestSecret(candidate) ? candidate : undefined; const upstream = await fetch(new URL(path, env.backendUrl), { method: "POST", headers: photoRequestHeaders({ customerToken, guestSecret, extra: { "x-publishable-api-key": env.publishableKey, "content-type": "application/json" } }), body: JSON.stringify(body), cache: "no-store" }); const payload = await upstream.json().catch(() => ({ error: { code: "photo_job_unavailable" } })); return response(payload, upstream.status) } catch { return response({ error: { code: "photo_job_unavailable" } }, 502) }
}
