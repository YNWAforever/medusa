import { NextRequest, NextResponse } from "next/server"
import { createCustomerAuthSdk, retrieveCustomer } from "../../../src/lib/medusa/auth"
import { createStoreSdk } from "../../../src/lib/medusa/client"
import { CUSTOMER_TOKEN_COOKIE, customerTokenCookieOptions } from "../../../src/lib/medusa/session"

function status(error: unknown): number | null {
  if (!(error instanceof Error) || !Reflect.has(error, "status")) return null
  const value = Reflect.get(error, "status")
  return typeof value === "number" ? value : null
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(CUSTOMER_TOKEN_COOKIE)?.value
  if (!token) return NextResponse.json({ error: { code: "authentication_required" } }, { status: 401 })

  try {
    const sdk = createCustomerAuthSdk(await createStoreSdk(token))
    return NextResponse.json({ customer: await retrieveCustomer(sdk) })
  } catch (error) {
    if (status(error) === 401 || status(error) === 403) {
      const response = NextResponse.json({ error: { code: "session_expired" } }, { status: 401 })
      response.cookies.set(CUSTOMER_TOKEN_COOKIE, "", { ...customerTokenCookieOptions, maxAge: 0 })
      return response
    }
    return NextResponse.json({ error: { code: "account_unavailable" } }, { status: 502 })
  }
}
