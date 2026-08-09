import { NextRequest, NextResponse } from "next/server"
import { getStorefrontEnv } from "../../../../../../../src/lib/medusa/env"
import { CUSTOMER_TOKEN_COOKIE } from "../../../../../../../src/lib/medusa/session"
import { PHOTO_GUEST_COOKIE, photoRequestHeaders, validPhotoGuestSecret } from "../../../../../../../src/lib/photo/ownership"

type Context = { params: Promise<{ jobId: string; assetId: string }> }
export async function GET(request: NextRequest, { params }: Context) {
  const { jobId, assetId } = await params
  try {
    const env = getStorefrontEnv(); const token = request.cookies.get(CUSTOMER_TOKEN_COOKIE)?.value; const candidate = request.cookies.get(PHOTO_GUEST_COOKIE)?.value; const guestSecret = validPhotoGuestSecret(candidate) ? candidate : undefined
    const upstream = await fetch(new URL(`/store/photo-jobs/${encodeURIComponent(jobId)}/assets/${encodeURIComponent(assetId)}/preview`, env.backendUrl), { headers: photoRequestHeaders({ customerToken: token, guestSecret, extra: { "x-publishable-api-key": env.publishableKey } }), cache: "no-store", redirect: "manual" })
    const location = upstream.headers.get("location")
    if (upstream.status !== 302 || !location) return new NextResponse(null, { status: upstream.status === 404 ? 404 : 502, headers: { "cache-control": "private, no-store" } })
    return NextResponse.redirect(location, { status: 302, headers: { "cache-control": "private, no-store" } })
  } catch { return new NextResponse(null, { status: 502, headers: { "cache-control": "private, no-store" } }) }
}
