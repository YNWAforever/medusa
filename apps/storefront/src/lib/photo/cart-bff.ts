import "server-only"

import { NextRequest, NextResponse } from "next/server"
import { createStoreSdk } from "../medusa/client"
import { getStorefrontEnv } from "../medusa/env"
import { projectCart } from "../medusa/cart"
import {
  CART_COOKIE,
  CUSTOMER_TOKEN_COOKIE,
  cartCookieOptions,
} from "../medusa/session"
import {
  configuredStorefrontOrigin,
  isAllowedPhotoMutationOrigin,
  PHOTO_GUEST_COOKIE,
  photoRequestHeaders,
  validPhotoGuestSecret,
} from "./ownership"

async function ensureCartId(request: NextRequest): Promise<{ id: string; created: boolean }> {
  const existing = request.cookies.get(CART_COOKIE)?.value
  if (existing) return { id: existing, created: false }

  const token = request.cookies.get(CUSTOMER_TOKEN_COOKIE)?.value
  const sdk = await createStoreSdk(token)
  const { regions } = await sdk.store.region.list({ fields: "id,currency_code,*countries" })
  const region = regions.find((candidate) =>
    candidate.currency_code?.toLowerCase() === "hkd"
    && candidate.countries?.some((country) => country.iso_2?.toLowerCase() === "hk"),
  )
  if (!region?.id) throw new Error("cart_region_unavailable")
  const { cart } = await sdk.store.cart.create({ region_id: region.id })
  if (!cart.id) throw new Error("cart_unavailable")
  return { id: cart.id, created: true }
}

export async function proxyPhotoCartMutation(
  request: NextRequest,
  jobId: string,
  method: "POST" | "DELETE",
  suppliedCartId?: string,
): Promise<NextResponse> {
  if (!isAllowedPhotoMutationOrigin(request.headers, configuredStorefrontOrigin(request.nextUrl.origin))) {
    return NextResponse.json({ error: { code: "photo_job_origin_forbidden" } }, { status: 403 })
  }

  try {
    const cart = suppliedCartId ? { id: suppliedCartId, created: false } : await ensureCartId(request)
    const env = getStorefrontEnv()
    const customerToken = request.cookies.get(CUSTOMER_TOKEN_COOKIE)?.value
    const candidate = request.cookies.get(PHOTO_GUEST_COOKIE)?.value
    const guestSecret = validPhotoGuestSecret(candidate) ? candidate : undefined
    const upstream = await fetch(
      new URL(`/store/photo-jobs/${encodeURIComponent(jobId)}/cart`, env.backendUrl),
      {
        method,
        headers: photoRequestHeaders({
          customerToken,
          guestSecret,
          extra: {
            "x-publishable-api-key": env.publishableKey,
            "content-type": "application/json",
          },
        }),
        body: JSON.stringify({ cartId: cart.id }),
        cache: "no-store",
      },
    )
    const payload = await upstream.json().catch(() => null) as { cart?: Parameters<typeof projectCart>[0]; error?: { code?: string } } | null
    if (!upstream.ok || !payload?.cart) {
      return NextResponse.json(
        { error: { code: payload?.error?.code ?? "photo_job_unavailable" } },
        { status: upstream.status || 502 },
      )
    }
    const response = NextResponse.json({ cart: projectCart(payload.cart) })
    if (cart.created) response.cookies.set(CART_COOKIE, cart.id, cartCookieOptions)
    return response
  } catch {
    return NextResponse.json({ error: { code: "photo_job_unavailable" } }, { status: 502 })
  }
}
