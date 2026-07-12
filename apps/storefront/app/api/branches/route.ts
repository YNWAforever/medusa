import { NextRequest, NextResponse } from "next/server"
import { createBranchStoreClient, getBranchAvailability } from "../../../src/lib/medusa/branches"
import { createStoreSdk } from "../../../src/lib/medusa/client"
import { CART_COOKIE, cartCookieOptions } from "../../../src/lib/medusa/session"
import type { Locale } from "../../../src/lib/medusa/contracts"

function errorStatus(error: unknown): number | null {
  if (!(error instanceof Error) || !Reflect.has(error, "status")) return null
  const status = Reflect.get(error, "status")
  return typeof status === "number" ? status : null
}

function isLocale(value: string | null): value is Locale {
  return value === "en" || value === "zh-HK"
}

export async function GET(request: NextRequest) {
  const cartId = request.nextUrl.searchParams.get("cartId")
  const locale = request.nextUrl.searchParams.get("locale")
  if (!cartId?.trim() || !isLocale(locale)) {
    return NextResponse.json(
      { error: { code: "invalid_branch_query" } },
      { status: 400 },
    )
  }

  const cookieCartId = request.cookies.get(CART_COOKIE)?.value
  if (!cookieCartId || cookieCartId !== cartId) {
    return NextResponse.json(
      { error: { code: "cart_scope_mismatch" } },
      { status: 403 },
    )
  }

  try {
    const client = createBranchStoreClient(await createStoreSdk())
    return NextResponse.json({
      branches: await getBranchAvailability(cartId, locale, client),
    }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    if (errorStatus(error) === 404) {
      const response = NextResponse.json(
        { error: { code: "cart_expired" } },
        { status: 410 },
      )
      response.cookies.set(CART_COOKIE, "", { ...cartCookieOptions, maxAge: 0 })
      return response
    }

    return NextResponse.json(
      { error: { code: "branch_unavailable" } },
      { status: 502 },
    )
  }
}
