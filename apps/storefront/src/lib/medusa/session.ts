export const CART_COOKIE = "fm_cart_id"

export const cartCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
}

export const CUSTOMER_TOKEN_COOKIE = "fm_customer_token"

export const customerTokenCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 8,
}

interface CookieWriter {
  cookies: {
    set(name: string, value: string, options: Record<string, unknown>): unknown
  }
}

/**
 * Ends the browser session completely.
 *
 * The cart cookie must go with the token: logging in calls Medusa's
 * `transferCart`, which permanently attaches the cart to that customer. Leaving
 * `fm_cart_id` behind would hand the next visitor a customer-owned cart, and any
 * order they placed would be filed under the previous customer's account.
 */
export function clearSessionCookies<T extends CookieWriter>(response: T): T {
  response.cookies.set(CART_COOKIE, "", { ...cartCookieOptions, maxAge: 0 })
  response.cookies.set(CUSTOMER_TOKEN_COOKIE, "", {
    ...customerTokenCookieOptions,
    maxAge: 0,
  })

  return response
}
