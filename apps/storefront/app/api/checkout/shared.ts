import { NextRequest, NextResponse } from "next/server"
import { getBranchAvailability, createBranchStoreClient } from "../../../src/lib/medusa/branches"
import { createStoreSdk } from "../../../src/lib/medusa/client"
import { CheckoutError, createCheckoutAdapter, createCheckoutSdk, type CheckoutAdapter } from "../../../src/lib/medusa/checkout"
import { CART_COOKIE, cartCookieOptions, CUSTOMER_TOKEN_COOKIE } from "../../../src/lib/medusa/session"
import type { BranchView } from "../../../src/lib/medusa/branches"
import type { Locale } from "../../../src/lib/medusa/contracts"
import { localeHref } from "../../../src/lib/locales"

export function parseLocale(request: NextRequest): Locale {
  const value = request.nextUrl.searchParams.get("locale")
  if (value === "en" || value === "zh-HK") return value
  throw new CheckoutError("invalid_checkout_input")
}

export function clearCart(response: NextResponse): NextResponse {
  response.cookies.set(CART_COOKIE, "", { ...cartCookieOptions, maxAge: 0 })
  return response
}

export function errorResponse(error: unknown, locale: Locale): NextResponse {
  const code = error instanceof CheckoutError
    ? error.code
    : typeof error === "object" && error !== null && typeof Reflect.get(error, "code") === "string"
      ? Reflect.get(error, "code") as string
      : null
  if (code === "empty_cart") {
    return NextResponse.json({ error: { code, recoveryHref: localeHref(locale, "/") } }, { status: 409 })
  }
  if (code) {
    const status = code === "invalid_checkout_input" ? 400 : code === "payment_session_failed" || code === "system_payment_unavailable" ? 502 : 422
    return NextResponse.json({ error: { code } }, { status })
  }
  const medusaStatus = error instanceof Error && Reflect.has(error, "status") ? Reflect.get(error, "status") : null
  if (medusaStatus === 404) {
    return clearCart(NextResponse.json({ error: { code: "cart_expired" } }, { status: 410 }))
  }
  if (medusaStatus === 409) return NextResponse.json({ error: { code: "checkout_conflict" } }, { status: 409 })
  return NextResponse.json({ error: { code: "checkout_unavailable" } }, { status: 502 })
}

export async function getContext(request: NextRequest, locale: Locale): Promise<{ cartId: string; adapter: CheckoutAdapter; branches: BranchView[] }> {
  const cartId = request.cookies.get(CART_COOKIE)?.value
  if (!cartId?.trim()) throw new CheckoutError("empty_cart")
  const token = request.cookies.get(CUSTOMER_TOKEN_COOKIE)?.value
  const sdk = await createStoreSdk(token)
  const checkoutSdk = createCheckoutSdk(sdk)
  const branches = await getBranchAvailability(cartId, locale, createBranchStoreClient(sdk))
  return { cartId, adapter: createCheckoutAdapter(checkoutSdk), branches }
}
