import { NextRequest, NextResponse } from "next/server"
import { createStoreSdk } from "../../../../src/lib/medusa/client"
import { CartError, createCartAdapter, parseAddCartItemInput } from "../../../../src/lib/medusa/cart"
import { CART_COOKIE, cartCookieOptions } from "../../../../src/lib/medusa/session"

function errorStatus(error: unknown): number | null {
  if (!(error instanceof Error) || !Reflect.has(error, "status")) {
    return null
  }

  const status = Reflect.get(error, "status")
  return typeof status === "number" ? status : null
}

async function readBody(request: NextRequest) {
  try {
    return parseAddCartItemInput(await request.json())
  } catch (error) {
    if (error instanceof CartError || error instanceof SyntaxError) {
      return null
    }

    throw error
  }
}

export async function POST(request: NextRequest) {
  const input = await readBody(request)

  if (!input) {
    return NextResponse.json({ error: { code: "invalid_cart_input" } }, { status: 400 })
  }

  const cartId = request.cookies.get(CART_COOKIE)?.value
  const adapter = createCartAdapter(await createStoreSdk())

  try {
    if (cartId) {
      return NextResponse.json({ cart: await adapter.addLine(cartId, input) })
    }

    const cart = await adapter.createWithLine(input)
    const response = NextResponse.json({ cart })
    response.cookies.set(CART_COOKIE, cart.id!, cartCookieOptions)
    return response
  } catch (error) {
    if (errorStatus(error) === 404 && cartId) {
      const response = NextResponse.json({ error: { code: "cart_expired" } }, { status: 410 })
      response.cookies.set(CART_COOKIE, "", { ...cartCookieOptions, maxAge: 0 })
      return response
    }

    if (errorStatus(error) === 409) {
      return NextResponse.json({ error: { code: "cart_conflict" } }, { status: 409 })
    }

    if (error instanceof CartError) {
      return NextResponse.json({ error: { code: error.code } }, { status: 400 })
    }

    return NextResponse.json({ error: { code: "cart_unavailable" } }, { status: 502 })
  }
}
