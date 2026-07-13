import { NextRequest, NextResponse } from "next/server"
import { ORDER_CONFIRMATION_COOKIE, orderConfirmationCookieOptions, unsealOrderConfirmation } from "../../../../src/lib/confirmation-cookie"

export async function GET(request: NextRequest) {
  const value = request.cookies.get(ORDER_CONFIRMATION_COOKIE)?.value
  const confirmation = unsealOrderConfirmation(value)
  const response = confirmation
    ? NextResponse.json({ confirmation }, { headers: { "cache-control": "no-store" } })
    : NextResponse.json({ error: { code: "confirmation_unavailable" } }, { status: 410, headers: { "cache-control": "no-store" } })
  response.cookies.set(ORDER_CONFIRMATION_COOKIE, "", { ...orderConfirmationCookieOptions, maxAge: 0 })
  return response
}
