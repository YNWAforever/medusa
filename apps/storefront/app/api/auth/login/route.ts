import { NextRequest, NextResponse } from "next/server"
import { AuthBoundaryError, createCustomerAuthSdk, loginCustomer, parseLoginInput } from "../../../../src/lib/medusa/auth"
import { createStoreSdk } from "../../../../src/lib/medusa/client"
import { CART_COOKIE, CUSTOMER_TOKEN_COOKIE, customerTokenCookieOptions } from "../../../../src/lib/medusa/session"

function status(error: unknown): number | null {
  if (!(error instanceof Error) || !Reflect.has(error, "status")) return null
  const value = Reflect.get(error, "status")
  return typeof value === "number" ? value : null
}

export async function POST(request: NextRequest) {
  let input
  try {
    input = parseLoginInput(await request.json())
  } catch {
    return NextResponse.json({ error: { code: "invalid_auth_input" } }, { status: 400 })
  }

  try {
    const sdk = createCustomerAuthSdk(await createStoreSdk())
    const result = await loginCustomer(sdk, input, request.cookies.get(CART_COOKIE)?.value)
    const response = NextResponse.json({ customer: result.customer })
    response.cookies.set(CUSTOMER_TOKEN_COOKIE, result.token, customerTokenCookieOptions)
    return response
  } catch (error) {
    if (status(error) === 401 || (error instanceof AuthBoundaryError && error.code === "unsupported_auth_response")) {
      return NextResponse.json({ error: { code: "invalid_credentials" } }, { status: 401 })
    }
    return NextResponse.json({ error: { code: "auth_unavailable" } }, { status: 502 })
  }
}
