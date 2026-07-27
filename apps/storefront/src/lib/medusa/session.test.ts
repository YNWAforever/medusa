import { describe, expect, it, vi } from "vitest"
import {
  CART_COOKIE,
  CUSTOMER_TOKEN_COOKIE,
  cartCookieOptions,
  clearSessionCookies,
  customerTokenCookieOptions,
} from "./session"

describe("cart session", () => {
  it("uses the private thirty-day cart cookie contract", () => {
    expect(CART_COOKIE).toBe("fm_cart_id")
    expect(cartCookieOptions).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 2_592_000,
    })
  })

  it("uses the private eight-hour customer token cookie contract", () => {
    expect(CUSTOMER_TOKEN_COOKIE).toBe("fm_customer_token")
    expect(customerTokenCookieOptions).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 28_800,
    })
  })
})

describe("clearSessionCookies", () => {
  it("expires the cart and the customer token together", () => {
    const set = vi.fn()

    const response = clearSessionCookies({ cookies: { set } })

    expect(response.cookies.set).toBe(set)
    expect(set).toHaveBeenCalledTimes(2)
    expect(set).toHaveBeenCalledWith(CART_COOKIE, "", {
      ...cartCookieOptions,
      maxAge: 0,
    })
    expect(set).toHaveBeenCalledWith(CUSTOMER_TOKEN_COOKIE, "", {
      ...customerTokenCookieOptions,
      maxAge: 0,
    })
  })

  it("never leaves the cart behind when the token is cleared", () => {
    const cleared: string[] = []

    clearSessionCookies({
      cookies: { set: (name: string) => cleared.push(name) },
    })

    expect(cleared).toContain(CART_COOKIE)
  })
})
