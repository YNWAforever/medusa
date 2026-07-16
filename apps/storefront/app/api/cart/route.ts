import { NextRequest, NextResponse } from "next/server"
import { createStoreSdk } from "../../../src/lib/medusa/client"
import { createCartAdapter, emptyCartView } from "../../../src/lib/medusa/cart"
import { CART_COOKIE, cartCookieOptions } from "../../../src/lib/medusa/session"

function errorStatus(error: unknown): number | null {
  if (!(error instanceof Error) || !Reflect.has(error, "status")) {
    return null
  }

  const status = Reflect.get(error, "status")
  return typeof status === "number" ? status : null
}

export async function GET(request: NextRequest) {
  const cartId = request.cookies.get(CART_COOKIE)?.value

  if (!cartId) {
    return NextResponse.json({ cart: emptyCartView() })
  }

  try {
    const adapter = createCartAdapter(await createStoreSdk())
    return NextResponse.json({ cart: await adapter.retrieve(cartId) })
  } catch (error) {
    if (errorStatus(error) === 404) {
      const response = NextResponse.json({ error: { code: "cart_expired" } }, { status: 410 })
      response.cookies.set(CART_COOKIE, "", { ...cartCookieOptions, maxAge: 0 })
      return response
    }

    return NextResponse.json({ error: { code: "cart_unavailable" } }, { status: 502 })
  }
}
