import { NextRequest, NextResponse } from "next/server"
import { createStoreSdk } from "../../../../../src/lib/medusa/client"
import {
  CartError,
  createCartAdapter,
  parseUpdateCartItemInput,
} from "../../../../../src/lib/medusa/cart"
import {
  CART_COOKIE,
  cartCookieOptions,
} from "../../../../../src/lib/medusa/session"

type RouteContext = { params: Promise<{ lineId: string }> }

function errorStatus(error: unknown): number | null {
  if (!(error instanceof Error) || !Reflect.has(error, "status")) return null
  const status = Reflect.get(error, "status")
  return typeof status === "number" ? status : null
}

function expiredResponse() {
  const response = NextResponse.json({ error: { code: "cart_expired" } }, { status: 410 })
  response.cookies.set(CART_COOKIE, "", { ...cartCookieOptions, maxAge: 0 })
  return response
}

function unavailableResponse() {
  return NextResponse.json({ error: { code: "cart_unavailable" } }, { status: 502 })
}

function lineNotFoundResponse() {
  return NextResponse.json({ error: { code: "cart_line_not_found" } }, { status: 404 })
}

async function confirmedAdapter(cartId: string) {
  const adapter = createCartAdapter(await createStoreSdk())
  const cart = await adapter.retrieve(cartId)
  return { adapter, cart }
}

async function getConfirmedAdapter(cartId: string) {
  try {
    return await confirmedAdapter(cartId)
  } catch (error) {
    return { response: errorStatus(error) === 404 ? expiredResponse() : unavailableResponse() }
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const cartId = request.cookies.get(CART_COOKIE)?.value
  if (!cartId) return expiredResponse()

  let quantity: number
  try {
    quantity = parseUpdateCartItemInput(await request.json())
  } catch (error) {
    if (error instanceof CartError || error instanceof SyntaxError) {
      return NextResponse.json({ error: { code: "invalid_cart_input" } }, { status: 400 })
    }
    throw error
  }

  const confirmed = await getConfirmedAdapter(cartId)
  if ("response" in confirmed) return confirmed.response

  const { lineId } = await params
  if (!confirmed.cart.items.some((item) => item.id === lineId)) return lineNotFoundResponse()

  try {
    return NextResponse.json({ cart: await confirmed.adapter.updateLine(cartId, lineId, quantity) })
  } catch (error) {
    if (errorStatus(error) === 404) return lineNotFoundResponse()
    if (errorStatus(error) === 409) {
      return NextResponse.json({ error: { code: "cart_conflict" } }, { status: 409 })
    }
    return unavailableResponse()
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const cartId = request.cookies.get(CART_COOKIE)?.value
  if (!cartId) return expiredResponse()

  const confirmed = await getConfirmedAdapter(cartId)
  if ("response" in confirmed) return confirmed.response

  const { lineId } = await params
  if (!confirmed.cart.items.some((item) => item.id === lineId)) return lineNotFoundResponse()

  try {
    return NextResponse.json({ cart: await confirmed.adapter.removeLine(cartId, lineId) })
  } catch (error) {
    if (errorStatus(error) === 404) return lineNotFoundResponse()
    if (errorStatus(error) === 409) {
      return NextResponse.json({ error: { code: "cart_conflict" } }, { status: 409 })
    }
    return unavailableResponse()
  }
}
