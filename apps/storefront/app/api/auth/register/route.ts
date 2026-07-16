import { NextRequest, NextResponse } from "next/server"
import { AuthBoundaryError, createCustomerAuthSdk, parseRegistrationInput, registerCustomer } from "../../../../src/lib/medusa/auth"
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
    input = parseRegistrationInput(await request.json())
  } catch {
    return NextResponse.json({ error: { code: "invalid_auth_input" } }, { status: 400 })
  }

  try {
    const sdk = createCustomerAuthSdk(await createStoreSdk())
    const result = await registerCustomer(
      sdk,
      input,
      request.cookies.get(CART_COOKIE)?.value,
    )
    const response = NextResponse.json({ customer: result.customer })
    response.cookies.set(CUSTOMER_TOKEN_COOKIE, result.token, customerTokenCookieOptions)
    return response
  } catch (error) {
    if (status(error) === 409) {
      return NextResponse.json({ error: { code: "duplicate_email" } }, { status: 409 })
    }
    if (error instanceof AuthBoundaryError && error.code === "invalid_auth_input") {
      return NextResponse.json({ error: { code: error.code } }, { status: 400 })
    }
    return NextResponse.json({ error: { code: "auth_unavailable" } }, { status: 502 })
  }
}
