import { NextResponse } from "next/server"
import { CUSTOMER_TOKEN_COOKIE, customerTokenCookieOptions } from "../../../../src/lib/medusa/session"

export async function POST() {
  const response = NextResponse.json({ customer: null })
  response.cookies.set(CUSTOMER_TOKEN_COOKIE, "", {
    ...customerTokenCookieOptions,
    maxAge: 0,
  })
  return response
}
